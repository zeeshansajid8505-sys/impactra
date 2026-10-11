import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as zlib from 'zlib';
import * as crypto from 'crypto';
import { ArchiveSecurityValidator } from '../security/archive-security.validator';

export interface ExtractedFileEntry {
  path: string;
  byteSize: number;
  content: Buffer;
  contentSha256: string;
}

export interface ExtractedArchiveResult {
  files: ExtractedFileEntry[];
  fileCount: number;
  sourceBytes: number;
  archiveSha256: string;
  archiveByteSize: number;
}

@Injectable()
export class TarReaderService {
  private readonly logger = new Logger(TarReaderService.name);

  constructor(private readonly securityValidator: ArchiveSecurityValidator) {}

  /**
   * Decompresses and extracts files from a tar or tar.gz archive buffer safely.
   */
  extract(archiveBuffer: Buffer): ExtractedArchiveResult {
    this.securityValidator.validateArchiveBufferSize(archiveBuffer);

    const archiveSha256 = crypto
      .createHash('sha256')
      .update(archiveBuffer)
      .digest('hex');
    const archiveByteSize = archiveBuffer.length;

    // Decompress gzip if gzipped (magic bytes 0x1f, 0x8b)
    let tarBuffer: Buffer;
    if (
      archiveBuffer.length >= 2 &&
      archiveBuffer[0] === 0x1f &&
      archiveBuffer[1] === 0x8b
    ) {
      try {
        tarBuffer = zlib.gunzipSync(archiveBuffer, {
          maxOutputLength: this.securityValidator.getLimits().maxExtractedBytes,
        });
      } catch (err: unknown) {
        const isTooLarge = (err as any)?.code === 'ERR_BUFFER_TOO_LARGE';
        if (isTooLarge) {
          throw new BadRequestException(
            `Decompressed archive size exceeds maximum allowable limit of ${this.securityValidator.getLimits().maxExtractedBytes} bytes.`,
          );
        }
        const msg = err instanceof Error ? err.message : String(err);
        throw new BadRequestException(
          `Failed to decompress gzip archive: ${msg}`,
        );
      }
    } else {
      tarBuffer = archiveBuffer;
    }

    const rawEntries: { rawPath: string; content: Buffer }[] = [];
    let offset = 0;
    let nextOverridePath: string | null = null;
    let cumulativeBytes = 0;
    let fileCount = 0;

    while (offset + 512 <= tarBuffer.length) {
      const header = tarBuffer.subarray(offset, offset + 512);

      // Check for zero block (end of tar)
      const isZeroBlock = header.every((byte) => byte === 0);
      if (isZeroBlock) {
        // Read ahead to see if archive ended
        offset += 512;
        break;
      }

      // Read filename (bytes 0 - 100)
      let name = this.readNullTerminatedString(header, 0, 100);

      // Read size (bytes 124 - 136, octal)
      const sizeStr = this.readNullTerminatedString(header, 124, 12).trim();
      const size = sizeStr ? parseInt(sizeStr, 8) : 0;
      if (isNaN(size) || size < 0) {
        throw new BadRequestException('Archive contains malformed entry with invalid octal size.');
      }

      // Read typeflag (byte 156)
      const typeflag = String.fromCharCode(header[156]);

      // Read prefix for ustar (bytes 345 - 500)
      const prefix = this.readNullTerminatedString(header, 345, 155);
      if (prefix) {
        name = `${prefix}/${name}`;
      }

      offset += 512; // Move past header

      // Calculate padded data size (must align to 512-byte blocks)
      const paddedSize = Math.ceil(size / 512) * 512;

      if (offset + size > tarBuffer.length) {
        throw new BadRequestException('Unexpected end of tar archive data block.');
      }

      const content = tarBuffer.subarray(offset, offset + size);
      offset += paddedSize; // Move past data

      // Handle GNU LongLink / LongName (typeflag 'L')
      if (typeflag === 'L') {
        nextOverridePath = this.readNullTerminatedString(content, 0, content.length);
        continue;
      }

      // Handle PAX extended header (typeflag 'x' or 'g')
      if (typeflag === 'x' || typeflag === 'g') {
        const paxHeaderStr = content.toString('utf8');
        const paxPathMatch = paxHeaderStr.match(/\d+ path=(.+)\n/);
        if (paxPathMatch && paxPathMatch[1]) {
          nextOverridePath = paxPathMatch[1].trim();
        }
        continue;
      }

      const entryPath = nextOverridePath || name;
      nextOverridePath = null;

      // Security validation MUST happen BEFORE unsafe normalization, directory skipping, or common prefix stripping.
      // Rejects traversal (../, ..\), absolute paths (/path, \path), Windows drives (C:), device names, etc.
      this.securityValidator.sanitizeAndValidatePath(entryPath);

      // Skip directory entries safely (typeflag '5' or path ending with '/' or '\')
      if (typeflag === '5' || entryPath.endsWith('/') || entryPath.endsWith('\\')) {
        continue;
      }

      // Reject symlinks, hardlinks, device files
      if (['1', '2', '3', '4', '6'].includes(typeflag)) {
        throw new BadRequestException(
          `Archive entry '${entryPath}' contains forbidden file type flag '${typeflag}' (symlink, hardlink, or device node).`,
        );
      }

      // Only regular files ('0' or '\0' or empty)
      if (typeflag !== '0' && typeflag !== '\0' && typeflag !== '') {
        continue;
      }

      // Security check single file size
      this.securityValidator.validateFileByteSize(size, entryPath);

      cumulativeBytes += size;
      fileCount += 1;

      // Security check running limits & compression bomb
      this.securityValidator.validateExtractionMetrics(
        fileCount,
        cumulativeBytes,
        archiveByteSize,
      );

      rawEntries.push({
        rawPath: entryPath,
        content: Buffer.from(content), // defensive copy
      });
    }

    // Determine common root directory prefix added by GitHub (e.g. `owner-repo-sha123/`)
    const commonPrefix = this.findCommonRootDirectory(
      rawEntries.map((e) => e.rawPath),
    );

    const files: ExtractedFileEntry[] = [];
    const seenPaths = new Set<string>();

    for (const entry of rawEntries) {
      let relativePath = entry.rawPath;
      if (commonPrefix && relativePath.startsWith(commonPrefix)) {
        relativePath = relativePath.slice(commonPrefix.length);
      }

      // Sanitize and validate normalized path
      const { normalizedPath } = this.securityValidator.sanitizeAndValidatePath(
        relativePath,
      );

      if (seenPaths.has(normalizedPath)) {
        throw new BadRequestException(
          `Archive contains duplicate conflicting entry for path '${normalizedPath}'.`,
        );
      }
      seenPaths.add(normalizedPath);

      const contentSha256 = crypto
        .createHash('sha256')
        .update(entry.content)
        .digest('hex');

      files.push({
        path: normalizedPath,
        byteSize: entry.content.length,
        content: entry.content,
        contentSha256,
      });
    }

    return {
      files,
      fileCount: files.length,
      sourceBytes: cumulativeBytes,
      archiveSha256,
      archiveByteSize,
    };
  }

  /**
   * Reads a null-terminated ASCII/UTF-8 string from a buffer slice.
   */
  private readNullTerminatedString(
    buf: Buffer,
    offset: number,
    length: number,
  ): string {
    const slice = buf.subarray(offset, offset + length);
    const nullIdx = slice.indexOf(0);
    const end = nullIdx === -1 ? slice.length : nullIdx;
    return slice.subarray(0, end).toString('utf8').trim();
  }

  /**
   * Identifies if all entries share a GitHub archive root directory (e.g. `owner-repo-sha123/`).
   * Never strips normal repository directories (e.g. `src/`, `app/`, `packages/`, etc.).
   */
  private findCommonRootDirectory(paths: string[]): string | null {
    if (paths.length === 0) return null;

    const firstSegments = paths.map((p) => {
      const normalized = p.replace(/\\/g, '/');
      const slashIdx = normalized.indexOf('/');
      return slashIdx > 0 ? normalized.substring(0, slashIdx + 1) : null;
    });

    const first = firstSegments[0];
    if (!first) return null;

    const allMatch = firstSegments.every((seg) => seg === first);
    if (!allMatch) return null;

    const rootDirName = first.replace(/\/$/, '');

    // Never strip preserved source or nested directories (Requirement E)
    const PRESERVED_ROOT_DIRS = new Set([
      'src',
      'app',
      'apps',
      'packages',
      'lib',
      'test',
      'tests',
      'docs',
      'public',
      'components',
      'services',
      'utils',
      'config',
      'scripts',
      'bin',
      'dist',
      'build',
      'node_modules',
    ]);

    if (PRESERVED_ROOT_DIRS.has(rootDirName.toLowerCase())) {
      return null;
    }

    // GitHub tarballs name the root folder: {repo}-{commitSha} or {owner}-{repo}-{commitSha}
    // Pattern matches commit SHA suffix (e.g. impactra-repo-97640de)
    const isGitHubShaSuffix = /-[0-9a-f]{7,40}$/i.test(rootDirName);

    // Or multiple files directly inside rootDirName (e.g. rootDirName/package.json)
    const hasDirectRootFiles = paths.some((p) => {
      const rest = p.startsWith(first) ? p.slice(first.length) : p;
      return !rest.includes('/') && rest.length > 0;
    });

    if (isGitHubShaSuffix || (hasDirectRootFiles && paths.length > 1)) {
      return first;
    }

    return null;
  }
}
