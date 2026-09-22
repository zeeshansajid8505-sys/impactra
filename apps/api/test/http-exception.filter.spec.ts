import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import {
  AllExceptionsFilter,
  sanitizeLogContent,
} from '../src/common/filters/http-exception.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let mockResponse: { status: jest.Mock };
  let mockRequest: { url: string; requestId: string; headers: Record<string, string> };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockResponse = {
      status: mockStatus,
    };
    mockRequest = {
      url: '/test-endpoint',
      requestId: 'test-req-id-123',
      headers: {},
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;
  });

  it('should format HttpException into structured ApiErrorResponse', () => {
    const exception = new HttpException(
      'Resource not found',
      HttpStatus.NOT_FOUND,
    );

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Resource not found',
        requestId: 'test-req-id-123',
        path: '/test-endpoint',
      }),
    );
  });

  it('should format unhandled generic Error safely without leaking internal details or stack traces to caller', () => {
    // Spy on logger to silence console output during tests and verify safe logging behavior
    const loggerSpy = jest
      .spyOn((filter as unknown as { logger: { error: jest.Mock } }).logger, 'error')
      .mockImplementation(() => {});

    const sensitiveError = new Error(
      'FATAL: connection to database server at 10.0.0.5:5432 failed for user postgres with password=supersecret at C:\\repo\\src\\db.ts',
    );

    filter.catch(sensitiveError, mockHost);

    // 1. Verify caller API response safety
    expect(mockStatus).toHaveBeenCalledWith(500);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected internal server error occurred',
        requestId: 'test-req-id-123',
        path: '/test-endpoint',
      }),
    );

    const rawJsonArg = mockJson.mock.calls[0]?.[0];
    expect(typeof rawJsonArg).toBe('object');
    expect(rawJsonArg).not.toBeNull();
    if (typeof rawJsonArg !== 'object' || rawJsonArg === null) {
      throw new Error('Expected response JSON payload to be a non-null object');
    }
    const jsonArg = rawJsonArg as Record<string, unknown>;
    expect(typeof jsonArg.message).toBe('string');
    expect(jsonArg.message as string).not.toContain('FATAL');
    expect(jsonArg.message as string).not.toContain('10.0.0.5');
    expect(jsonArg.message as string).not.toContain('supersecret');
    expect(jsonArg.stack).toBeUndefined();

    // 2. Verify server-side structured log safety
    expect(loggerSpy).toHaveBeenCalledTimes(1);
    const rawLogged = loggerSpy.mock.calls[0]?.[0];
    expect(typeof rawLogged).toBe('string');
    if (typeof rawLogged !== 'string') {
      throw new Error('Expected logger to receive a string argument');
    }
    const loggedPayload = JSON.parse(rawLogged) as Record<string, unknown>;
    expect(loggedPayload.level).toBe('ERROR');
    expect(loggedPayload.service).toBe('impactra-api');
    expect(loggedPayload.requestId).toBe('test-req-id-123');

    // Sensitive items must be redacted in the log payload
    expect(typeof loggedPayload.message).toBe('string');
    const loggedMessage = loggedPayload.message as string;
    expect(loggedMessage).not.toContain('10.0.0.5');
    expect(loggedMessage).not.toContain('supersecret');
    expect(loggedMessage).not.toContain('C:\\repo\\src\\db.ts');
    expect(loggedMessage).toContain('[INTERNAL_IP]');
    expect(loggedMessage).toContain('password=[REDACTED]');
    expect(loggedMessage).toContain('[REDACTED_PATH]');

    // Stack traces must be suppressed in test/prod environments
    expect(loggedPayload.stack).toBeUndefined();

    loggerSpy.mockRestore();
  });

  describe('sanitizeLogContent', () => {
    it('should redact database URI credentials, passwords, tokens, IPs, and filesystem paths', () => {
      const raw =
        'Error connecting to postgresql://admin:secretPass@10.0.4.12:5432/impactra with token=ghp_secret12345 in C:\\Users\\Dev\\workspace\\app.ts';
      const sanitized = sanitizeLogContent(raw);

      expect(sanitized).not.toContain('admin:secretPass');
      expect(sanitized).toContain('postgresql://[REDACTED]:[REDACTED]@');
      expect(sanitized).not.toContain('token=ghp_secret12345');
      expect(sanitized).toContain('token=[REDACTED]');
      expect(sanitized).not.toContain('10.0.4.12');
      expect(sanitized).toContain('[INTERNAL_IP]');
      expect(sanitized).not.toContain('C:\\Users\\Dev\\workspace\\app.ts');
      expect(sanitized).toContain('[REDACTED_PATH]');
    });
  });
});
