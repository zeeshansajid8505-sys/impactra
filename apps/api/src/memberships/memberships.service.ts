import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { TokenService } from '../auth/services/token.service';
import { InviteMemberDto } from './dto';
import { MembershipDto, MembershipRole } from '@impactra/shared';
import { OrganizationMembership, User } from '@impactra/database';

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Lists all members of the specified organization with associated user metadata.
   */
  async listMembers(organizationId: string): Promise<MembershipDto[]> {
    const memberships =
      await this.databaseService.client.organizationMembership.findMany({
        where: { organizationId },
        include: { user: true },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      });

    return memberships.map((m) => this.formatMembership(m));
  }

  /**
   * Adds an existing user directly to the organization, or creates a secure invitation.
   */
  async addOrInviteMember(
    organizationId: string,
    caller: { userId: string; role: MembershipRole },
    dto: InviteMemberDto,
  ): Promise<{
    status: 'added' | 'invited';
    membership?: MembershipDto;
    invitationId?: string;
    invitationLink?: string;
    email: string;
    role: MembershipRole;
  }> {
    // Privilege check: Only an OWNER can grant the OWNER role
    if (dto.role === 'OWNER' && caller.role !== 'OWNER') {
      throw new ForbiddenException(
        'Only an existing OWNER can assign the OWNER role to a member.',
      );
    }

    const normalizedEmail = dto.email.toLowerCase().trim();

    // Check if user already exists
    const user = await this.databaseService.client.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user) {
      // Check if already a member
      const existing =
        await this.databaseService.client.organizationMembership.findUnique({
          where: {
            organizationId_userId: {
              organizationId,
              userId: user.id,
            },
          },
        });

      if (existing) {
        throw new ConflictException(
          'User is already an active member of this organization.',
        );
      }

      // Add user directly as member
      const created =
        await this.databaseService.client.organizationMembership.create({
          data: {
            organizationId,
            userId: user.id,
            role: dto.role,
          },
          include: { user: true },
        });

      this.logger.log(
        `Added existing user ${user.id} (${normalizedEmail}) as ${dto.role} to org ${organizationId}.`,
      );

      return {
        status: 'added',
        membership: this.formatMembership(created),
        email: normalizedEmail,
        role: dto.role,
      };
    }

    // User does not exist yet: create secure invitation token
    const rawToken = this.tokenService.generateOpaqueToken();
    const tokenHash = this.tokenService.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Clean up any pending invitation for the same email
    await this.databaseService.client.organizationInvitation.deleteMany({
      where: { organizationId, email: normalizedEmail },
    });

    const invitation =
      await this.databaseService.client.organizationInvitation.create({
        data: {
          organizationId,
          email: normalizedEmail,
          role: dto.role,
          tokenHash,
          inviterId: caller.userId,
          expiresAt,
        },
      });

    return {
      status: 'invited',
      invitationId: invitation.id,
      email: normalizedEmail,
      role: dto.role,
      invitationLink:
        process.env.NODE_ENV !== 'production'
          ? `/register?invite=${rawToken}`
          : undefined,
    };
  }

  /**
   * Updates a member's role with rigorous owner safeguards and privilege checking.
   */
  async updateMemberRole(
    organizationId: string,
    membershipId: string,
    caller: { userId: string; role: MembershipRole },
    targetRole: MembershipRole,
  ): Promise<MembershipDto> {
    const target =
      await this.databaseService.client.organizationMembership.findUnique({
        where: { id: membershipId },
      });

    // 1. Cross-tenant defense: ensure membership strictly belongs to target organization
    if (!target || target.organizationId !== organizationId) {
      throw new NotFoundException(
        'Membership not found within this organization.',
      );
    }

    // 2. Self-promotion defense: cannot elevate oneself to OWNER
    if (target.userId === caller.userId && caller.role !== 'OWNER' && targetRole === 'OWNER') {
      throw new ForbiddenException(
        'Self-promotion to OWNER is strictly prohibited.',
      );
    }

    // 3. ADMIN authority bounds: cannot modify an OWNER, cannot promote to OWNER
    if (caller.role === 'ADMIN') {
      if (target.role === 'OWNER') {
        throw new ForbiddenException(
          'An ADMIN cannot alter the role of an organization OWNER.',
        );
      }
      if (targetRole === 'OWNER') {
        throw new ForbiddenException(
          'Only an existing OWNER can promote another member to OWNER.',
        );
      }
    }

    // 4. Last OWNER safeguard: Cannot demote the last remaining OWNER
    if (target.role === 'OWNER' && targetRole !== 'OWNER') {
      const ownerCount =
        await this.databaseService.client.organizationMembership.count({
          where: {
            organizationId,
            role: 'OWNER',
          },
        });

      if (ownerCount <= 1) {
        throw new BadRequestException(
          'Cannot demote the last remaining OWNER. An organization must have at least one owner.',
        );
      }
    }

    const updated =
      await this.databaseService.client.organizationMembership.update({
        where: { id: membershipId },
        data: { role: targetRole },
        include: { user: true },
      });

    this.logger.log(
      `Role of member ${membershipId} in org ${organizationId} updated to ${targetRole} by ${caller.userId}.`,
    );

    return this.formatMembership(updated);
  }

  /**
   * Removes a member from an organization with last-owner protection.
   */
  async removeMember(
    organizationId: string,
    membershipId: string,
    caller: { userId: string; role: MembershipRole },
  ): Promise<{ message: string }> {
    const target =
      await this.databaseService.client.organizationMembership.findUnique({
        where: { id: membershipId },
      });

    // 1. Cross-tenant defense
    if (!target || target.organizationId !== organizationId) {
      throw new NotFoundException(
        'Membership not found within this organization.',
      );
    }

    // 2. ADMIN authority bounds
    if (caller.role === 'ADMIN' && target.role === 'OWNER') {
      throw new ForbiddenException(
        'An ADMIN cannot remove an organization OWNER.',
      );
    }

    // 3. Last OWNER safeguard
    if (target.role === 'OWNER') {
      const ownerCount =
        await this.databaseService.client.organizationMembership.count({
          where: {
            organizationId,
            role: 'OWNER',
          },
        });

      if (ownerCount <= 1) {
        throw new BadRequestException(
          'Cannot remove the last remaining OWNER. Transfer ownership first before leaving.',
        );
      }
    }

    await this.databaseService.client.organizationMembership.delete({
      where: { id: membershipId },
    });

    this.logger.log(
      `Member ${membershipId} removed from org ${organizationId} by caller ${caller.userId}.`,
    );

    return { message: 'Member successfully removed from organization.' };
  }

  private formatMembership(
    m: OrganizationMembership & { user?: User },
  ): MembershipDto {
    return {
      id: m.id,
      organizationId: m.organizationId,
      userId: m.userId,
      role: m.role,
      createdAt: m.createdAt.toISOString(),
      user: m.user
        ? {
            id: m.user.id,
            email: m.user.email,
            name: m.user.name,
          }
        : undefined,
    };
  }
}
