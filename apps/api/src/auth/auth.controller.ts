import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Req,
  Res,
  Param,
  HttpStatus,
  HttpCode,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SessionsService } from '../sessions/sessions.service';
import { AuthGuard, SESSION_COOKIE_NAME } from './guards/auth.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { CurrentSession } from './decorators/current-session.decorator';
import { RateLimit, RateLimiterGuard } from '../common/guards/rate-limiter.guard';
import { CsrfOriginGuard } from '../common/guards/csrf-origin.guard';
import { ConfigService } from '@nestjs/config';
import {
  RegisterDto,
  LoginDto,
  ChangePasswordDto,
  PasswordResetRequestDto,
  PasswordResetConfirmDto,
} from './dto';
import { User, Session } from '@impactra/database';
import { AuthResponse, SessionDto } from '@impactra/shared';

const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

@ApiTags('Authentication & Sessions')
@Controller('auth')
@UseGuards(AuthGuard, CsrfOriginGuard, RateLimiterGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionsService: SessionsService,
    private readonly configService: ConfigService,
  ) {}

  private isCookieSecure(): boolean {
    const configured = this.configService.get<boolean>('app.cookieSecure');
    if (configured !== undefined) {
      return configured;
    }
    const envCookieSecure = this.configService.get<boolean>('COOKIE_SECURE');
    if (envCookieSecure !== undefined) {
      return envCookieSecure;
    }
    return process.env.NODE_ENV === 'production';
  }

  private setSessionCookie(res: Response, rawToken: string): void {
    res.cookie(SESSION_COOKIE_NAME, rawToken, {
      httpOnly: true,
      secure: this.isCookieSecure(),
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE_MS,
    });
  }

  private clearSessionCookie(res: Response): void {
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: this.isCookieSecure(),
      sameSite: 'lax',
      path: '/',
    });
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 10, ttlSeconds: 60, prefix: 'register' })
  @ApiOperation({ summary: 'Register a new user and establish a secure session' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 400, description: 'Invalid input or weak password' })
  @ApiResponse({ status: 409, description: 'Email address already exists' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = (req.headers['x-forwarded-for'] || req.socket.remoteAddress) as string;

    const result = await this.authService.register(dto, userAgent, ipAddress);
    this.setSessionCookie(res, result.rawToken);

    return {
      user: result.user,
      session: result.session,
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 10, ttlSeconds: 60, prefix: 'login' })
  @ApiOperation({ summary: 'Log in with corporate email and password' })
  @ApiResponse({ status: 200, description: 'Authentication successful' })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = (req.headers['x-forwarded-for'] || req.socket.remoteAddress) as string;

    const result = await this.authService.login(dto, userAgent, ipAddress);
    this.setSessionCookie(res, result.rawToken);

    return {
      user: result.user,
      session: result.session,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Revoke the current session and clear session cookie' })
  @ApiResponse({ status: 200, description: 'Successfully logged out' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken =
      req.cookies?.[SESSION_COOKIE_NAME] ||
      (req.headers.cookie?.includes(SESSION_COOKIE_NAME)
        ? req.headers.cookie
            .split(';')
            .find((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
            ?.split('=')[1]
        : null);

    if (rawToken) {
      await this.sessionsService.revokeSessionByToken(rawToken);
    }

    this.clearSessionCookie(res);
    return { message: 'Logged out successfully.' };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Revoke all active sessions for this user across all devices' })
  @ApiResponse({ status: 200, description: 'All sessions successfully revoked' })
  async logoutAll(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.sessionsService.revokeAllUserSessions(user.id);
    this.clearSessionCookie(res);
    return { message: 'Logged out from all active sessions successfully.' };
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Retrieve current authenticated user, session, and organizations' })
  @ApiResponse({ status: 200, description: 'Authenticated user details' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  async getMe(
    @CurrentUser() user: User,
    @CurrentSession() session: Session,
  ): Promise<AuthResponse> {
    return this.authService.getMe(user.id, session);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @RateLimit({ limit: 5, ttlSeconds: 60, prefix: 'change-password' })
  @ApiOperation({ summary: 'Change account password and invalidate other sessions' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid password or mismatch' })
  async changePassword(
    @CurrentUser() user: User,
    @CurrentSession() session: Session,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto, session.id);
  }

  @Public()
  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 5, ttlSeconds: 300, prefix: 'password-reset-request' })
  @ApiOperation({ summary: 'Request a password reset link (prevents user enumeration)' })
  @ApiResponse({ status: 200, description: 'Password reset instructions dispatched' })
  async requestPasswordReset(@Body() dto: PasswordResetRequestDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 5, ttlSeconds: 300, prefix: 'password-reset-confirm' })
  @ApiOperation({ summary: 'Reset account password using a valid reset token' })
  @ApiResponse({ status: 200, description: 'Password successfully reset' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async confirmPasswordReset(@Body() dto: PasswordResetConfirmDto) {
    return this.authService.confirmPasswordReset(dto);
  }

  @Get('sessions')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'List all active sessions for current user' })
  @ApiResponse({ status: 200, description: 'List of active sessions' })
  async getSessions(
    @CurrentUser() user: User,
    @CurrentSession() session: Session,
  ): Promise<SessionDto[]> {
    return this.sessionsService.getUserActiveSessions(user.id, session.id);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Revoke a specific session' })
  @ApiResponse({ status: 200, description: 'Session revoked successfully' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async revokeSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: User,
    @CurrentSession() session: Session,
    @Res({ passthrough: true }) res: Response,
  ) {
    const revoked = await this.sessionsService.revokeSessionById(
      sessionId,
      user.id,
    );
    if (!revoked) {
      throw new NotFoundException('Session not found or already revoked.');
    }

    if (sessionId === session.id) {
      this.clearSessionCookie(res);
    }

    return { message: 'Session revoked successfully.' };
  }
}
