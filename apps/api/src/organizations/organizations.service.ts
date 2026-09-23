import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto';
import { OrganizationDto, UserOrganizationSummary } from '@impactra/shared';
import { Organization, OrganizationMembership } from '@impactra/database';

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Transactionally creates a new organization and assigns the caller as initial OWNER.
   * Atomicity guarantees an organization can never exist without an owner.
   */
  async create(
    userId: string,
    dto: CreateOrganizationDto,
  ): Promise<{ organization: OrganizationDto; membership: OrganizationMembership }> {
    const cleanName = dto.name.trim();

    let candidateSlug = dto.slug
      ? dto.slug.toLowerCase().trim()
      : cleanName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

    if (!candidateSlug || candidateSlug.length < 2) {
      candidateSlug = `org-${Date.now().toString(36)}`;
    }

    // Check slug collision
    const existing = await this.databaseService.client.organization.findUnique({
      where: { slug: candidateSlug },
    });

    if (existing) {
      if (dto.slug) {
        throw new ConflictException(
          `Organization slug '${dto.slug}' is already taken. Please choose a different identifier.`,
        );
      }
      candidateSlug = `${candidateSlug}-${Math.random().toString(36).substring(2, 6)}`;
    }

    return this.databaseService.client.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: cleanName,
          slug: candidateSlug,
        },
      });

      const membership = await tx.organizationMembership.create({
        data: {
          organizationId: organization.id,
          userId,
          role: 'OWNER',
        },
        include: {
          organization: true,
        },
      });

      this.logger.log(
        `Created organization ${organization.id} (${organization.slug}) with OWNER ${userId}.`,
      );

      return {
        organization: this.formatOrganization(organization),
        membership,
      };
    });
  }

  /**
   * Retrieves all organizations where the given user holds an active membership.
   */
  async listForUser(userId: string): Promise<UserOrganizationSummary[]> {
    const memberships =
      await this.databaseService.client.organizationMembership.findMany({
        where: { userId },
        include: { organization: true },
        orderBy: { createdAt: 'asc' },
      });

    return memberships.map((m) => ({
      organization: this.formatOrganization(m.organization),
      membership: {
        id: m.id,
        role: m.role,
      },
    }));
  }

  /**
   * Retrieves an organization by ID.
   */
  async getById(organizationId: string): Promise<OrganizationDto> {
    const organization =
      await this.databaseService.client.organization.findUnique({
        where: { id: organizationId },
      });

    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }

    return this.formatOrganization(organization);
  }

  /**
   * Updates organization settings (name, slug).
   */
  async update(
    organizationId: string,
    dto: UpdateOrganizationDto,
  ): Promise<OrganizationDto> {
    if (dto.slug) {
      const slugCandidate = dto.slug.toLowerCase().trim();
      const existing = await this.databaseService.client.organization.findFirst({
        where: {
          slug: slugCandidate,
          id: { not: organizationId },
        },
      });

      if (existing) {
        throw new ConflictException(
          `Organization slug '${dto.slug}' is already taken by another organization.`,
        );
      }
    }

    const updated = await this.databaseService.client.organization.update({
      where: { id: organizationId },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.slug ? { slug: dto.slug.toLowerCase().trim() } : {}),
      },
    });

    return this.formatOrganization(updated);
  }

  formatOrganization(org: Organization): OrganizationDto {
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
    };
  }
}
