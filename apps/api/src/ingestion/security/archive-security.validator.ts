import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface IngestionLimits {
  maxArchiveBytes: number;
  maxExtractedBytes: number;
  maxFileBytes: number;
  maxFileCount: number;
  maxPathDepth: number;
  maxPathLength: number;
}

export const DEFAULT_INGESTION_LIMITS: IngestionLimits = {
  maxArchiveBytes: 52428800, // 50 MB
  maxExtractedBytes: 262144000, // 250 MB
  maxFileBytes: 5242880, // 5 MB
  maxFileCount: 10000,
  maxPathDepth: 20,
  maxPathLength: 255,
};

const WINDOWS_DEVICE_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

@Injectable()
export class ArchiveSecurityValidator {
  private readonly limits: IngestionLimits;

  constructor(private readonly configService: ConfigService) {
    this.limits = {
      maxArchiveBytes:
        this.configService.get<number>('app.ingestion.maxArchiveBytes') ||
        DEFAULT_INGESTION_LIMITS.maxArchiveBytes,
      maxExtractedBytes:
        this.configService.get<number>('app.ingestion.maxExtractedBytes') ||
        DEFAULT_INGESTION_LIMITS.maxExtractedBytes,
      maxFileBytes:
        this.configService.get<number>('app.ingestion.maxFileBytes') ||
        DEFAULT_INGESTION_LIMITS.maxFileBytes,
      maxFileCount:
        this.configService.get<number>('app.ingestion.maxFileCount') ||
        DEFAULT_INGESTION_LIMITS.maxFileCount,
      maxPathDepth:
        this.configService.get<number>('app.ingestion.maxPathDepth') ||
        DEFAULT_INGESTION_LIMITS.maxPathDepth,
      maxPathLength:
        this.configService.get<number>('app.ingestion.maxPathLength') ||
        DEFAULT_INGESTION_LIMITS.maxPathLength,
    };
  }

  getLimits(): IngestionLimits {
    return { ...this.limits };
  }

  /**
   * Validates archive buffer size before decompression.
   */
  validateArchiveBufferSize(archiveBuffer: Buffer): void {
    if (!archiveBuffer || archiveBuffer.length === 0) {
      throw new BadRequestException('Repository archive is empty or invalid.');
    }

    if (archiveBuffer.length > this.limits.maxArchiveBytes) {
      throw new BadRequestException(
        `Repository archive size (${archiveBuffer.length} bytes) exceeds maximum allowable limit of ${this.limits.maxArchiveBytes} bytes.`,
      );
    }
  }

  /**
   * Validates and normalizes entry path, preventing directory traversal, absolute paths, and reserved devices.
   * Enforces security validation BEFORE any normalization.
   */
  sanitizeAndValidatePath(rawPath: string): { isValid: true; normalizedPath: string } {
    if (!rawPath || typeof rawPath !== 'string') {
      throw new BadRequestException('Archive entry has missing or empty path name.');
    }

    // 1. Reject null bytes
    if (rawPath.includes('\0')) {
      throw new BadRequestException('Archive entry contains illegal null byte characters in path.');
    }

    const trimmed = rawPath.trim();
    if (!trimmed) {
      throw new BadRequestException('Archive entry resolves to empty path.');
    }

    // 2. Reject absolute POSIX and Windows paths (must NOT sanitize by stripping leading slashes)
    if (trimmed.startsWith('/') || trimmed.startsWith('\\')) {
      throw new BadRequestException(
        `Archive entry path '${rawPath}' contains forbidden absolute path specification.`,
      );
    }

    // 3. Reject Windows drive specifications (e.g. C:, D:)
    if (/^[a-zA-Z]:/.test(trimmed)) {
      throw new BadRequestException(
        `Archive entry path '${rawPath}' contains forbidden absolute drive specification.`,
      );
    }

    if (trimmed.length > this.limits.maxPathLength) {
      throw new BadRequestException(
        `Archive entry path length (${trimmed.length}) exceeds maximum allowable length of ${this.limits.maxPathLength} characters.`,
      );
    }

    // 4. Split by both '/' and '\' to inspect raw path segments
    const segments = trimmed.split(/[/\\]/);

    // Reject paths exceeding depth limit
    const nonEmptySegments = segments.filter(Boolean);
    if (nonEmptySegments.length > this.limits.maxPathDepth) {
      throw new BadRequestException(
        `Archive entry path depth (${nonEmptySegments.length}) exceeds maximum allowable depth of ${this.limits.maxPathDepth}.`,
      );
    }

    const resolvedSegments: string[] = [];

    for (const segment of segments) {
      if (!segment || segment === '.') {
        continue;
      }

      // 5. Reject any real ".." path segment (e.g. "..", but allow "file..name.ts")
      if (segment === '..') {
        throw new BadRequestException(
          `Archive entry path '${rawPath}' contains illegal directory traversal sequence '..'.`,
        );
      }

      // 6. Check Windows/POSIX reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
      const baseName = segment.split('.')[0].toUpperCase();
      if (WINDOWS_DEVICE_NAMES.has(baseName)) {
        throw new BadRequestException(
          `Archive entry path '${rawPath}' uses forbidden reserved system device name '${segment}'.`,
        );
      }

      resolvedSegments.push(segment);
    }

    if (resolvedSegments.length === 0) {
      throw new BadRequestException(`Archive entry path '${rawPath}' resolved to empty target.`);
    }

    // Canonical representation uses '/' as internal repository separator
    const normalizedPath = resolvedSegments.join('/');
    return { isValid: true, normalizedPath };
  }

  /**
   * Validates single file byte size.
   */
  validateFileByteSize(byteSize: number, path: string): void {
    if (byteSize < 0) {
      throw new BadRequestException(`Archive entry '${path}' has negative byte size.`);
    }

    if (byteSize > this.limits.maxFileBytes) {
      throw new BadRequestException(
        `Archive file '${path}' (${byteSize} bytes) exceeds maximum single file limit of ${this.limits.maxFileBytes} bytes.`,
      );
    }
  }

  /**
   * Tracks and validates running extraction metrics against zip-bomb and scale limits.
   */
  validateExtractionMetrics(
    fileCount: number,
    cumulativeExtractedBytes: number,
    archiveBytes: number,
  ): void {
    if (fileCount > this.limits.maxFileCount) {
      throw new BadRequestException(
        `Repository file count (${fileCount}) exceeds maximum allowable limit of ${this.limits.maxFileCount} files.`,
      );
    }

    if (cumulativeExtractedBytes > this.limits.maxExtractedBytes) {
      throw new BadRequestException(
        `Cumulative extracted repository size (${cumulativeExtractedBytes} bytes) exceeds maximum allowable limit of ${this.limits.maxExtractedBytes} bytes.`,
      );
    }

    // Zip bomb detection: expansion ratio check once extraction passes 10MB
    if (cumulativeExtractedBytes > 10 * 1024 * 1024 && archiveBytes > 0) {
      const ratio = cumulativeExtractedBytes / archiveBytes;
      if (ratio > 100) {
        throw new BadRequestException(
          `Decompression expansion ratio (${ratio.toFixed(1)}x) exceeds safe threshold of 100x. Aborting extraction to prevent denial of service.`,
        );
      }
    }
  }
}
