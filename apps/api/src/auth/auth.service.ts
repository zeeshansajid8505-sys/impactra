import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { SessionsService } from '../sessions/sessions.service';
import {
  RegisterDto,
  LoginDto,
  ChangePasswordDto,
  PasswordResetRequestDto,
  PasswordResetConfirmDto,
} from './dto';
import {
  AuthResponse,
  UserDto,
  SessionDto,
  UserOrganizationSummary,
} from '@impactra/shared';
import { User, Session } from '@impactra/database';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly sessionsService: SessionsService,
  ) {}

  /**
   * Registers a new user, hashes password with Argon2id, and establishes a session.
   */
  async register(
    dto: RegisterDto,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<{ user: UserDto; session: SessionDto; rawToken: string }> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // 1. Password policy verification
    const validation = this.passwordService.validate(dto.password);
    if (!validation.isValid) {
      throw new BadRequestException(validation.message);
    }

    // 2. Uniqueness check
    const existing = await this.databaseService.client.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException(
        'An account with this email address already exists.',
      );
    }

    // 3. Argon2id / scrypt hashing
    const passwordHash = await this.passwordService.hash(dto.password);

    // 4. Persistence
    const user = await this.databaseService.client.user.create({
      data: {
        name: dto.name.trim(),
        email: normalizedEmail,
        passwordHash,
      },
    });

    // 5. Establish session
    const { session, rawToken } = await this.sessionsService.createSession(
      user.id,
      userAgent,
      ipAddress,
    );

    return {
      user: this.formatUser(user),
      session: this.formatSession(session, true),
      rawToken,
    };
  }

  /**
   * Authenticates user credentials with timing-safe comparison and generic rejection.
   */
  async login(
    dto: LoginDto,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<{ user: UserDto; session: SessionDto; rawToken: string }> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const user = await this.databaseService.client.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Constant-time decoy verification to prevent timing attack enumeration
    if (!user) {
      await this.passwordService.verify(
        '$scrypt$N=16384,r=8,p=1$deadbeefdeadbeef$deadbeefdeadbeefdeadbeefdeadbeef',
        dto.password,
      );
      throw new UnauthorizedException('Invalid email or password.');
    }

    const isValid = await this.passwordService.verify(
      user.passwordHash,
      dto.password,
    );
    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const { session, rawToken } = await this.sessionsService.createSession(
      user.id,
      userAgent,
      ipAddress,
    );

    return {
      user: this.formatUser(user),
      session: this.formatSession(session, true),
      rawToken,
    };
  }

  /**
   * Returns current user identity, active session, and accessible organizations.
   */
  async getMe(userId: string, currentSession: Session): Promise<AuthResponse> {
    const user = await this.databaseService.client.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists.');
    }

    const organizations: UserOrganizationSummary[] = user.memberships.map((m) => ({
      organization: {
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        createdAt: m.organization.createdAt.toISOString(),
        updatedAt: m.organization.updatedAt.toISOString(),
      },
      membership: {
        id: m.id,
        role: m.role,
      },
    }));

    return {
      user: this.formatUser(user),
      session: this.formatSession(currentSession, true),
      organizations,
    };
  }

  /**
   * Securely changes password, validating current password and revoking other sessions.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    currentSessionId: string,
  ): Promise<{ message: string }> {
    const user = await this.databaseService.client.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException('User account not found.');
    }

    const isMatch = await this.passwordService.verify(
      user.passwordHash,
      dto.currentPassword,
    );
    if (!isMatch) {
      throw new BadRequestException('Current password is incorrect.');
    }

    const validation = this.passwordService.validate(dto.newPassword);
    if (!validation.isValid) {
      throw new BadRequestException(validation.message);
    }

    const newHash = await this.passwordService.hash(dto.newPassword);

    await this.databaseService.client.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    // Invalidate all other active sessions for defense in depth
    await this.sessionsService.revokeAllUserSessions(userId, currentSessionId);

    return {
      message:
        'Password updated successfully. All other active sessions have been revoked.',
    };
  }

  /**
   * Generates a single-use password reset token with generic responses to prevent enumeration.
   */
  async requestPasswordReset(
    dto: PasswordResetRequestDto,
  ): Promise<{ message: string; devResetToken?: string }> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const user = await this.databaseService.client.user.findUnique({
      where: { email: normalizedEmail },
    });

    let devToken: string | undefined;

    if (user) {
      const rawToken = this.tokenService.generateOpaqueToken();
      const tokenHash = this.tokenService.hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await this.databaseService.client.passwordResetToken.create({
        data: {
          tokenHash,
          userId: user.id,
          expiresAt,
        },
      });

      // In non-production environments, expose token for automated testing
      if (process.env.NODE_ENV !== 'production') {
        devToken = rawToken;
      }
    }

    return {
      message:
        'If an account exists with this email address, password reset instructions have been generated.',
      devResetToken: devToken,
    };
  }

  /**
   * Confirms password reset using a valid, unexpired, single-use token.
   */
  async confirmPasswordReset(
    dto: PasswordResetConfirmDto,
  ): Promise<{ message: string }> {
    const validation = this.passwordService.validate(dto.newPassword);
    if (!validation.isValid) {
      throw new BadRequestException(validation.message);
    }

    const tokenHash = this.tokenService.hashToken(dto.token);
    const now = new Date();

    const resetRecord =
      await this.databaseService.client.passwordResetToken.findFirst({
        where: {
          tokenHash,
          usedAt: null,
          expiresAt: { gt: now },
        },
      });

    if (!resetRecord) {
      throw new BadRequestException(
        'Invalid, expired, or already-used password reset token.',
      );
    }

    const newHash = await this.passwordService.hash(dto.newPassword);

    await this.databaseService.client.$transaction([
      this.databaseService.client.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash: newHash },
      }),
      this.databaseService.client.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: now },
      }),
    ]);

    // Revoke all existing sessions
    await this.sessionsService.revokeAllUserSessions(resetRecord.userId);

    return {
      message:
        'Password has been reset successfully. Please log in with your new credentials.',
    };
  }

  formatUser(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerifiedAt: user.emailVerifiedAt
        ? user.emailVerifiedAt.toISOString()
        : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  formatSession(session: Session, isCurrent: boolean): SessionDto {
    return {
      id: session.id,
      userId: session.userId,
      createdAt: session.createdAt.toISOString(),
      lastActiveAt: session.lastActiveAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      isCurrent,
    };
  }
}
