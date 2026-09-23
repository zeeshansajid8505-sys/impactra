import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SessionsService } from '../../sessions/sessions.service';

export const SESSION_COOKIE_NAME = 'impactra_session';

function extractSessionCookie(request: any): string | null {
  // 1. Direct cookie-parser parsed cookies
  if (request.cookies && request.cookies[SESSION_COOKIE_NAME]) {
    return request.cookies[SESSION_COOKIE_NAME];
  }

  // 2. Fallback to raw Cookie header parsing
  const cookieHeader: string | undefined = request.headers?.cookie;
  if (!cookieHeader) return null;

  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [name, ...val] = part.trim().split('=');
    if (name === SESSION_COOKIE_NAME) {
      return decodeURIComponent(val.join('='));
    }
  }

  return null;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionsService: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = extractSessionCookie(request);

    if (!token) {
      throw new UnauthorizedException(
        'Authentication required. Missing session cookie.',
      );
    }

    const result = await this.sessionsService.validateSession(token);
    if (!result) {
      throw new UnauthorizedException(
        'Invalid or expired session. Please log in again.',
      );
    }

    request.user = result.user;
    request.session = result.session;

    return true;
  }
}
