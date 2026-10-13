import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChangedFileService } from './changed-file.service';
import { ChangedFileStatus } from '@impactra/shared';
import { RawPullRequestFile } from '../types/change.types';

describe('ChangedFileService', () => {
  let service: ChangedFileService;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue: any) => {
        if (key === 'app.changes.maxPatchBytesPerFile') return 100; // 100 bytes for test
        if (key === 'app.changes.maxTotalPatchBytes') return 250; // 250 bytes for test
        if (key === 'app.ingestion.maxPathLength') return 50;
        if (key === 'app.ingestion.maxPathDepth') return 5;
        return defaultValue;
      }),
    };
    service = new ChangedFileService(mockConfigService as ConfigService);
  });

  describe('normalizePath', () => {
    it('normalizes valid paths with forward slashes', () => {
      expect(service.normalizePath('src\\utils\\helper.ts')).toBe('src/utils/helper.ts');
      expect(service.normalizePath('src\\index.ts')).toBe('src/index.ts');
      expect(service.normalizePath('./components/button.tsx')).toBe('components/button.tsx');
    });

    it('rejects absolute paths with leading slash or backslash or drive', () => {
      expect(() => service.normalizePath('/src/index.ts')).toThrow(BadRequestException);
      expect(() => service.normalizePath('\\src\\index.ts')).toThrow(BadRequestException);
      expect(() => service.normalizePath('C:\\src\\index.ts')).toThrow(BadRequestException);
    });

    it('rejects path with null byte', () => {
      expect(() => service.normalizePath('src/file\0.ts')).toThrow(BadRequestException);
    });

    it('rejects directory traversal', () => {
      expect(() => service.normalizePath('../etc/passwd')).toThrow(BadRequestException);
      expect(() => service.normalizePath('src/../../secret.ts')).toThrow(BadRequestException);
    });

    it('rejects empty or whitespace-only paths', () => {
      expect(() => service.normalizePath('')).toThrow(BadRequestException);
    });

    it('rejects paths exceeding max depth', () => {
      expect(() => service.normalizePath('a/b/c/d/e/f/file.ts')).toThrow(BadRequestException);
    });

    it('rejects paths exceeding max length', () => {
      const longPath = 'a'.repeat(60) + '.ts';
      expect(() => service.normalizePath(longPath)).toThrow(BadRequestException);
    });
  });

  describe('mapFileStatus', () => {
    it('maps GitHub statuses to canonical ChangedFileStatus', () => {
      expect(service.mapFileStatus('added')).toBe(ChangedFileStatus.ADDED);
      expect(service.mapFileStatus('removed')).toBe(ChangedFileStatus.DELETED);
      expect(service.mapFileStatus('renamed')).toBe(ChangedFileStatus.RENAMED);
      expect(service.mapFileStatus('modified')).toBe(ChangedFileStatus.MODIFIED);
      expect(service.mapFileStatus('changed')).toBe(ChangedFileStatus.MODIFIED);
    });
  });

  describe('processFiles', () => {
    it('processes added, deleted, renamed, and modified files with correct paths', () => {
      const raw: RawPullRequestFile[] = [
        {
          sha: '111',
          filename: 'src/new.ts',
          status: 'added',
          additions: 10,
          deletions: 0,
          changes: 10,
          patch: '@@ +1 @@\n+console.log("new");',
        },
        {
          sha: '222',
          filename: 'src/old.ts',
          status: 'removed',
          additions: 0,
          deletions: 5,
          changes: 5,
          patch: '@@ -1 @@\n-console.log("old");',
        },
        {
          sha: '333',
          filename: 'src/renamed-new.ts',
          previous_filename: 'src/renamed-old.ts',
          status: 'renamed',
          additions: 2,
          deletions: 1,
          changes: 3,
          patch: '@@ ... @@',
        },
        {
          sha: '444',
          filename: 'src/modified.ts',
          status: 'modified',
          additions: 3,
          deletions: 2,
          changes: 5,
          patch: '@@ ... @@',
        },
      ];

      const processed = service.processFiles(raw);
      expect(processed).toHaveLength(4);

      expect(processed[0].status).toBe(ChangedFileStatus.ADDED);
      expect(processed[0].oldPath).toBeNull();
      expect(processed[0].newPath).toBe('src/new.ts');

      expect(processed[1].status).toBe(ChangedFileStatus.DELETED);
      expect(processed[1].oldPath).toBe('src/old.ts');
      expect(processed[1].newPath).toBeNull();

      expect(processed[2].status).toBe(ChangedFileStatus.RENAMED);
      expect(processed[2].oldPath).toBe('src/renamed-old.ts');
      expect(processed[2].newPath).toBe('src/renamed-new.ts');

      expect(processed[3].status).toBe(ChangedFileStatus.MODIFIED);
      expect(processed[3].oldPath).toBe('src/modified.ts');
      expect(processed[3].newPath).toBe('src/modified.ts');
    });

    it('truncates file patch exceeding maxPatchBytesPerFile', () => {
      const bigPatch = 'x'.repeat(150);
      const raw: RawPullRequestFile[] = [
        {
          sha: '555',
          filename: 'src/big.ts',
          status: 'modified',
          additions: 10,
          deletions: 10,
          changes: 20,
          patch: bigPatch,
        },
      ];

      const processed = service.processFiles(raw);
      expect(processed[0].patchTruncated).toBe(true);
      expect(Buffer.byteLength(processed[0].patch!, 'utf8')).toBe(100);
    });

    it('detects binary files when patch is null/undefined for files with changes', () => {
      const raw: RawPullRequestFile[] = [
        {
          sha: '666',
          filename: 'assets/image.png',
          status: 'added',
          additions: 50,
          deletions: 0,
          changes: 50,
          patch: undefined,
        },
      ];

      const processed = service.processFiles(raw);
      expect(processed[0].binary).toBe(true);
      expect(processed[0].patchAvailable).toBe(false);
      expect(processed[0].patch).toBeNull();
    });
  });
});
