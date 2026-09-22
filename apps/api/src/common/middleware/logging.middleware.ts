import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RequestWithId } from './request-id.middleware';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const startHrTime = process.hrtime();
    const requestId = (req as RequestWithId).requestId || 'unknown';
    const method = req.method;
    const url = req.originalUrl || req.url;

    res.on('finish', () => {
      const [seconds, nanoseconds] = process.hrtime(startHrTime);
      const durationMs = Math.round((seconds * 1000 + nanoseconds / 1e6) * 100) / 100;
      const statusCode = res.statusCode;

      const logPayload = {
        timestamp: new Date().toISOString(),
        level: statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO',
        service: 'impactra-api',
        requestId,
        method,
        route: url,
        statusCode,
        durationMs,
      };

      if (statusCode >= 500) {
        this.logger.error(JSON.stringify(logPayload));
      } else if (statusCode >= 400) {
        this.logger.warn(JSON.stringify(logPayload));
      } else {
        this.logger.log(JSON.stringify(logPayload));
      }
    });

    next();
  }
}
