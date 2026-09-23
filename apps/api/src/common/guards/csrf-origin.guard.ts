import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly allowedOrigins: string[];

  constructor(private readonly configService: ConfigService) {
    const rawOrigins =
      this.configService.get<string>('app.corsOrigin') ||
      process.env.CORS_ORIGIN ||
      'http://localhost:3000,http://impactra.local';

    this.allowedOrigins = rawOrigins
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const method = request.method?.toUpperCase();

    // Safe read methods are immune to CSRF state changes
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    // Check if request is authenticated with cookie
    const rawCookie = request.headers.cookie;
    const hasSessionCookie =
      rawCookie && rawCookie.includes('impactra_session=');

    // If not authenticated via session cookie, standard CORS & credential checks apply
    if (!hasSessionCookie) {
      return true;
    }

    // For state-changing requests authenticated with session cookie, verify Origin
    const origin = request.headers['origin'];
    const referer = request.headers['referer'];

    let requestOrigin: string | null = null;
    if (origin) {
      requestOrigin = origin;
    } else if (referer) {
      try {
        const parsed = new URL(referer);
        requestOrigin = parsed.origin;
      } catch {
        requestOrigin = null;
      }
    }

    if (!requestOrigin || !this.allowedOrigins.includes(requestOrigin)) {
      throw new ForbiddenException(
        'Cross-Site Request Forgery (CSRF) origin verification failed.',
      );
    }

    return true;
  }
}
