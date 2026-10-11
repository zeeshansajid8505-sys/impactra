import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ArchiveSecurityValidator,
  DEFAULT_INGESTION_LIMITS,
} from './archive-security.validator';

describe('ArchiveSecurityValidator', () => {
  let validator: ArchiveSecurityValidator;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'app.ingestion.maxArchiveBytes') return 52428800;
        if (key === 'app.ingestion.maxExtractedBytes') return 262144000;
        if (key === 'app.ingestion.maxFileBytes') return 5242880;
        if (key === 'app.ingestion.maxFileCount') return 10000;
        if (key === 'app.ingestion.maxPathDepth') return 20;
        if (key === 'app.ingestion.maxPathLength') return 255;
        return undefined;
      }),
    };
    validator = new ArchiveSecurityValidator(mockConfigService as ConfigService);
  });

  describe('validateArchiveBufferSize', () => {
    it('accepts buffer within size limits', () => {
      const buffer = Buffer.alloc(1024);
      expect(() => validator.validateArchiveBufferSize(buffer)).not.toThrow();
    });

    it('rejects empty or zero-length buffer', () => {
      expect(() => validator.validateArchiveBufferSize(Buffer.alloc(0))).toThrow(
        BadRequestException,
      );
    });

    it('rejects archive buffer exceeding maximum byte limit', () => {
      const oversized = Buffer.alloc(52428801);
      expect(() => validator.validateArchiveBufferSize(oversized)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('sanitizeAndValidatePath', () => {
    it('normalizes valid relative paths with forward slashes', () => {
      const result = validator.sanitizeAndValidatePath('src/components/Button.tsx');
      expect(result.isValid).toBe(true);
      expect(result.normalizedPath).toBe('src/components/Button.tsx');
    });

    it('normalizes windows backward slashes to forward slashes', () => {
      const result = validator.sanitizeAndValidatePath('src\\lib\\utils.ts');
      expect(result.isValid).toBe(true);
      expect(result.normalizedPath).toBe('src/lib/utils.ts');
    });

    it('normalizes redundant relative dot segments', () => {
      const result = validator.sanitizeAndValidatePath('./packages/./shared/src/index.ts');
      expect(result.isValid).toBe(true);
      expect(result.normalizedPath).toBe('packages/shared/src/index.ts');
    });

    it('preserves valid filenames containing consecutive dots that are not traversal', () => {
      const result = validator.sanitizeAndValidatePath('src/file..name.ts');
      expect(result.isValid).toBe(true);
      expect(result.normalizedPath).toBe('src/file..name.ts');
    });

    it('rejects absolute POSIX paths starting with slash', () => {
      expect(() => validator.sanitizeAndValidatePath('/etc/passwd')).toThrow(
        BadRequestException,
      );
      expect(() => validator.sanitizeAndValidatePath('/absolute/path')).toThrow(
        BadRequestException,
      );
    });

    it('rejects absolute Windows paths starting with backslash', () => {
      expect(() => validator.sanitizeAndValidatePath('\\absolute\\windows\\path')).toThrow(
        BadRequestException,
      );
      expect(() => validator.sanitizeAndValidatePath('\\Windows\\System32')).toThrow(
        BadRequestException,
      );
    });

    it('rejects directory traversal attempts with double dots', () => {
      expect(() => validator.sanitizeAndValidatePath('../etc/passwd')).toThrow(
        BadRequestException,
      );
      expect(() => validator.sanitizeAndValidatePath('foo/../../bar')).toThrow(
        BadRequestException,
      );
      expect(() => validator.sanitizeAndValidatePath('src/../..')).toThrow(
        BadRequestException,
      );
      expect(() => validator.sanitizeAndValidatePath('src\\..\\..\\secret.txt')).toThrow(
        BadRequestException,
      );
    });

    it('rejects paths containing null bytes', () => {
      expect(() => validator.sanitizeAndValidatePath('src/safe.ts\0hidden.exe')).toThrow(
        BadRequestException,
      );
    });

    it('rejects absolute Windows drive letters', () => {
      expect(() => validator.sanitizeAndValidatePath('C:\\Windows\\System32')).toThrow(
        BadRequestException,
      );
      expect(() => validator.sanitizeAndValidatePath('D:/repo/secret.env')).toThrow(
        BadRequestException,
      );
    });

    it('rejects Windows reserved device names', () => {
      expect(() => validator.sanitizeAndValidatePath('src/CON.txt')).toThrow(
        BadRequestException,
      );
      expect(() => validator.sanitizeAndValidatePath('aux.json')).toThrow(
        BadRequestException,
      );
      expect(() => validator.sanitizeAndValidatePath('NUL')).toThrow(
        BadRequestException,
      );
    });

    it('rejects paths exceeding maximum length', () => {
      const longPath = 'a/'.repeat(130) + 'file.ts';
      expect(() => validator.sanitizeAndValidatePath(longPath)).toThrow(
        BadRequestException,
      );
    });

    it('rejects paths exceeding maximum depth', () => {
      const deepPath = Array(25).fill('dir').join('/') + '/file.ts';
      expect(() => validator.sanitizeAndValidatePath(deepPath)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateFileByteSize', () => {
    it('accepts file within single file limit', () => {
      expect(() =>
        validator.validateFileByteSize(1024 * 1024, 'src/main.ts'),
      ).not.toThrow();
    });

    it('rejects single file exceeding limit', () => {
      expect(() =>
        validator.validateFileByteSize(DEFAULT_INGESTION_LIMITS.maxFileBytes + 1, 'large.bin'),
      ).toThrow(BadRequestException);
    });

    it('rejects negative byte size', () => {
      expect(() => validator.validateFileByteSize(-1, 'corrupt.ts')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateExtractionMetrics', () => {
    it('accepts metrics within safety boundaries', () => {
      expect(() =>
        validator.validateExtractionMetrics(50, 1024 * 1024, 512 * 1024),
      ).not.toThrow();
    });

    it('rejects file count exceeding limit', () => {
      expect(() =>
        validator.validateExtractionMetrics(10001, 1024, 1024),
      ).toThrow(BadRequestException);
    });

    it('rejects cumulative extracted bytes exceeding limit', () => {
      expect(() =>
        validator.validateExtractionMetrics(10, 262144001, 1024),
      ).toThrow(BadRequestException);
    });

    it('detects and aborts zip bomb expansion ratios', () => {
      // 20MB extracted from 100KB archive = 200x expansion ratio
      expect(() =>
        validator.validateExtractionMetrics(1, 20 * 1024 * 1024, 100 * 1024),
      ).toThrow(BadRequestException);
    });
  });
});
