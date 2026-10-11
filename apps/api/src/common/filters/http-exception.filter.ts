import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse } from '@impactra/shared';
import { RequestWithId } from '../middleware/request-id.middleware';

/**
 * Redacts sensitive credentials, private IP addresses, connection strings,
 * and filesystem paths from log messages.
 */
export function sanitizeLogContent(input: string): string {
  return input
    // Mask URI credentials: postgresql://user:pass@host:port -> postgresql://[REDACTED]:[REDACTED]@host:port
    .replace(
      /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^:@\s]+):([^@\s]+)@/g,
      '$1[REDACTED]:[REDACTED]@',
    )
    // Mask sensitive key-value query or config pairs (password=..., token=..., secret=...)
    .replace(
      /\b(password|secret|token|apiKey|key|authorization|credential)=([^\s;&]+)/gi,
      '$1=[REDACTED]',
    )
    // Mask Bearer tokens
    .replace(/\bBearer\s+[a-zA-Z0-9_\-.]+/gi, 'Bearer [REDACTED]')
    // Mask absolute Windows and Unix filesystem paths
    .replace(
      /(?:[a-zA-Z]:\\[^\s:;,]+|\/(?:home|usr|app|var|etc)\/[^\s:;,]+)/g,
      '[REDACTED_PATH]',
    )
    // Mask private RFC-1918 internal IP addresses
    .replace(
      /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g,
      '[INTERNAL_IP]',
    );
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (request as RequestWithId).requestId ||
      (request.headers['x-request-id'] as string) ||
      'unknown';

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected internal error occurred';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        code = this.deriveErrorCode(statusCode);
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const respObj = exceptionResponse as Record<string, unknown>;
        message =
          typeof respObj.message === 'string'
            ? respObj.message
            : Array.isArray(respObj.message)
              ? respObj.message.join('; ')
              : exception.message;

        code =
          typeof respObj.error === 'string'
            ? respObj.error.toUpperCase().replace(/\s+/g, '_')
            : this.deriveErrorCode(statusCode);

        if (Array.isArray(respObj.message)) {
          details = respObj.message;
        }
      }
    } else if (
      // Safely recognize Express / body-parser 413 Payload Too Large errors
      (typeof (exception as any)?.status === 'number' && (exception as any).status === 413) ||
      (typeof (exception as any)?.statusCode === 'number' && (exception as any).statusCode === 413) ||
      (exception as any)?.type === 'entity.too.large'
    ) {
      statusCode = HttpStatus.PAYLOAD_TOO_LARGE;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'Request body too large';
    } else if (exception instanceof Error) {
      // Unhandled non-Http error (e.g. database error, network timeout)
      // Never expose raw SQL, paths, or secrets to caller
      const isProduction = process.env.NODE_ENV === 'production';
      const isTest = process.env.NODE_ENV === 'test';

      const safeMessage = sanitizeLogContent(exception.message);

      const logPayload: Record<string, unknown> = {
        level: 'ERROR',
        service: 'impactra-api',
        requestId,
        errorType: exception.name || 'Error',
        message: safeMessage,
      };

      // In production or test, suppress raw stack dumps containing host filesystem paths
      if (!isProduction && !isTest && exception.stack) {
        logPayload.stack = sanitizeLogContent(exception.stack);
      }

      this.logger.error(JSON.stringify(logPayload));

      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'INTERNAL_SERVER_ERROR';
      message = 'An unexpected internal server error occurred';
    }

    const errorPayload: ApiErrorResponse = {
      statusCode,
      code,
      message,
      requestId,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(details ? { details } : {}),
    };

    response.status(statusCode).json(errorPayload);
  }

  private deriveErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return 'PAYLOAD_TOO_LARGE';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'UNPROCESSABLE_ENTITY';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'SERVICE_UNAVAILABLE';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
