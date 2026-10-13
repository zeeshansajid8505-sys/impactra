import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RawPullRequestFile, ProcessedChangedFile } from '../types/change.types';
import { ChangedFileStatus } from '@impactra/shared';

@Injectable()
export class ChangedFileService {
  private readonly logger = new Logger(ChangedFileService.name);
  private readonly maxPatchBytesPerFile: number;
  private readonly maxTotalPatchBytes: number;
  private readonly maxPathLength: number;
  private readonly maxPathDepth: number;

  constructor(private readonly configService: ConfigService) {
    this.maxPatchBytesPerFile = this.configService.get<number>(
      'app.changes.maxPatchBytesPerFile',
      262144, // 256KB
    );
    this.maxTotalPatchBytes = this.configService.get<number>(
      'app.changes.maxTotalPatchBytes',
      10485760, // 10MB
    );
    this.maxPathLength = this.configService.get<number>(
      'app.ingestion.maxPathLength',
      255,
    );
    this.maxPathDepth = this.configService.get<number>(
      'app.ingestion.maxPathDepth',
      20,
    );
  }

  /**
   * Normalizes a file path, sanitizing slashes and rejecting malicious patterns.
   */
  normalizePath(rawPath: string): string {
    if (!rawPath || typeof rawPath !== 'string') {
      throw new BadRequestException('Path must be a non-empty string');
    }

    if (rawPath.includes('\0')) {
      throw new BadRequestException('Path contains invalid null byte');
    }

    const trimmed = rawPath.trim();
    if (!trimmed) {
      throw new BadRequestException('Path must be a non-empty string');
    }

    // Reject absolute POSIX and Windows paths (must NOT sanitize by stripping leading slashes)
    if (trimmed.startsWith('/') || trimmed.startsWith('\\')) {
      throw new BadRequestException(
        `Path '${rawPath}' contains forbidden absolute path specification`,
      );
    }

    // Reject Windows drive specifications (e.g. C:, D:)
    if (/^[a-zA-Z]:/.test(trimmed)) {
      throw new BadRequestException(
        `Path '${rawPath}' contains forbidden absolute drive specification`,
      );
    }

    if (trimmed.length > this.maxPathLength) {
      throw new BadRequestException(
        `Path length ${trimmed.length} exceeds max allowed length (${this.maxPathLength}) in '${rawPath}'`,
      );
    }

    const segments = trimmed.split(/[/\\]/);
    const nonEmptySegments = segments.filter(Boolean);

    if (nonEmptySegments.length > this.maxPathDepth) {
      throw new BadRequestException(
        `Path depth ${nonEmptySegments.length} exceeds max allowed depth (${this.maxPathDepth}) in '${rawPath}'`,
      );
    }

    const cleanSegments: string[] = [];
    for (const segment of segments) {
      if (!segment || segment === '.') {
        continue;
      }
      if (segment === '..') {
        throw new BadRequestException(`Directory traversal rejected in path '${rawPath}'`);
      }
      cleanSegments.push(segment);
    }

    if (cleanSegments.length === 0) {
      throw new BadRequestException(`Path '${rawPath}' resolves to empty path`);
    }

    return cleanSegments.join('/');
  }

  /**
   * Maps GitHub file status string to canonical ChangedFileStatus enum.
   */
  mapFileStatus(status: string): ChangedFileStatus {
    switch (status.toLowerCase()) {
      case 'added':
        return ChangedFileStatus.ADDED;
      case 'removed':
        return ChangedFileStatus.DELETED;
      case 'renamed':
        return ChangedFileStatus.RENAMED;
      case 'modified':
      case 'changed':
      case 'copied':
      default:
        return ChangedFileStatus.MODIFIED;
    }
  }

  /**
   * Processes a list of raw pull request files, applying security normalization,
   * patch size limits, and binary file detection.
   */
  processFiles(rawFiles: RawPullRequestFile[]): ProcessedChangedFile[] {
    let accumulatedPatchBytes = 0;
    const processed: ProcessedChangedFile[] = [];

    for (const raw of rawFiles) {
      const normalizedFilename = this.normalizePath(raw.filename);
      const normalizedPreviousFilename = raw.previous_filename
        ? this.normalizePath(raw.previous_filename)
        : null;

      const status = this.mapFileStatus(raw.status);

      let oldPath: string | null = null;
      let newPath: string | null = null;

      switch (status) {
        case ChangedFileStatus.ADDED:
          oldPath = null;
          newPath = normalizedFilename;
          break;
        case ChangedFileStatus.DELETED:
          oldPath = normalizedFilename;
          newPath = null;
          break;
        case ChangedFileStatus.RENAMED:
          oldPath = normalizedPreviousFilename || normalizedFilename;
          newPath = normalizedFilename;
          break;
        case ChangedFileStatus.MODIFIED:
        default:
          oldPath = normalizedFilename;
          newPath = normalizedFilename;
          break;
      }

      // Binary detection: GitHub leaves patch null for binary files or large diffs
      const isBinary =
        raw.patch === undefined ||
        (raw.patch === null && raw.status !== 'removed' && (raw.additions > 0 || raw.deletions > 0));

      let patchText: string | null = null;
      let isTruncated = false;

      if (raw.patch && !isBinary) {
        const patchBuffer = Buffer.from(raw.patch, 'utf8');
        const patchBytes = patchBuffer.length;

        if (patchBytes > this.maxPatchBytesPerFile) {
          isTruncated = true;
          patchText = patchBuffer.subarray(0, this.maxPatchBytesPerFile).toString('utf8');
        } else if (accumulatedPatchBytes + patchBytes > this.maxTotalPatchBytes) {
          isTruncated = true;
          const remainingAllowed = Math.max(0, this.maxTotalPatchBytes - accumulatedPatchBytes);
          if (remainingAllowed > 0) {
            patchText = patchBuffer.subarray(0, remainingAllowed).toString('utf8');
          } else {
            patchText = null;
          }
        } else {
          patchText = raw.patch;
        }

        if (patchText) {
          accumulatedPatchBytes += Buffer.byteLength(patchText, 'utf8');
        }
      }

      processed.push({
        oldPath,
        newPath,
        status,
        additions: raw.additions || 0,
        deletions: raw.deletions || 0,
        changes: raw.changes || (raw.additions || 0) + (raw.deletions || 0),
        patch: patchText,
        patchAvailable: patchText !== null && patchText.length > 0,
        patchTruncated: isTruncated,
        binary: Boolean(isBinary),
        rawPayload: {
          sha: raw.sha,
          status: raw.status,
          blob_url: raw.blob_url,
          raw_url: raw.raw_url,
        },
      });
    }

    return processed;
  }
}
