import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CacheService } from '../../cache/cache.service';

export interface RateLimitOptions {
  limit: number;
  ttlSeconds: number;
  prefix: string;
}

export const RATE_LIMIT_KEY = 'rate_limit';
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

@Injectable()
export class RateLimiterGuard implements CanActivate {
  private readonly memoryStore = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(
    private readonly reflector: Reflector,
    private readonly cacheService: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const rawIp =
      request.headers['x-forwarded-for'] ||
      request.socket?.remoteAddress ||
      'unknown-ip';
    const clientIp = Array.isArray(rawIp)
      ? rawIp[0]
      : String(rawIp).split(',')[0].trim();

    const key = `impactra:auth:rate:${options.prefix}:${clientIp}`;

    const redis = this.cacheService.redisClient;
    if (redis && redis.status === 'ready') {
      try {
        const current = await redis.incr(key);
        if (current === 1) {
          await redis.expire(key, options.ttlSeconds);
        }
        if (current > options.limit) {
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              code: 'RATE_LIMIT_EXCEEDED',
              message:
                'Too many requests. Please slow down and try again later.',
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        return true;
      } catch (err: unknown) {
        if (err instanceof HttpException) throw err;
        // Redis failure: fallback to in-memory store
      }
    }

    // In-memory fallback
    const now = Date.now();
    const record = this.memoryStore.get(key);

    if (!record || now > record.resetAt) {
      this.memoryStore.set(key, {
        count: 1,
        resetAt: now + options.ttlSeconds * 1000,
      });
      return true;
    }

    record.count += 1;
    if (record.count > options.limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'RATE_LIMIT_EXCEEDED',
          message:
            'Too many requests. Please slow down and try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
