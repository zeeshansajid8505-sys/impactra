import * as zlib from 'zlib';
import { BadRequestException } from '@nestjs/common';
import { TarReaderService } from './tar-reader.service';
import { ArchiveSecurityValidator } from '../security/archive-security.validator';

function createTarArchive(
  entries: { name: string; prefix?: string; content?: string | Buffer; typeflag?: string }[],
  gzip = false,
): Buffer {
  const chunks: Buffer[] = [];

  for (const entry of entries) {
    const header = Buffer.alloc(512, 0);
    const content = entry.content
      ? Buffer.isBuffer(entry.content)
        ? entry.content
        : Buffer.from(entry.content, 'utf8')
      : Buffer.alloc(0);

    // Name (bytes 0 - 99)
    header.write(entry.name, 0, 100, 'utf8');
    // Mode
    header.write('0000644\0', 100, 8, 'utf8');
    // Size (octal)
    const octalSize = content.length.toString(8).padStart(11, '0') + '\0';
    header.write(octalSize, 124, 12, 'utf8');
    // Typeflag
    header.write(entry.typeflag || '0', 156, 1, 'utf8');
    // Magic
    header.write('ustar\0', 257, 6, 'utf8');
    header.write('00', 263, 2, 'utf8');

    // USTAR Prefix (bytes 345 - 499, length 155)
    if (entry.prefix) {
      header.write(entry.prefix, 345, 155, 'utf8');
    }

    // Simple checksum
    let sum = 0;
    for (let i = 0; i < 512; i++) {
      sum += i >= 148 && i < 156 ? 32 : header[i]; // checksum field treated as spaces
    }
    const octalSum = sum.toString(8).padStart(6, '0') + '\0 ';
    header.write(octalSum, 148, 8, 'utf8');

    chunks.push(header);

    if (content.length > 0) {
      chunks.push(content);
      const padding = 512 - (content.length % 512);
      if (padding < 512) {
        chunks.push(Buffer.alloc(padding, 0));
      }
    }
  }

  // End of archive zero blocks (1024 bytes)
  chunks.push(Buffer.alloc(1024, 0));

  const tarBuffer = Buffer.concat(chunks);
  return gzip ? zlib.gzipSync(tarBuffer) : tarBuffer;
}

describe('TarReaderService', () => {
  let service: TarReaderService;
  let validator: ArchiveSecurityValidator;

  beforeEach(() => {
    validator = new ArchiveSecurityValidator({
      get: jest.fn().mockReturnValue(undefined),
    } as any);
    service = new TarReaderService(validator);
  });

  it('successfully extracts a simple uncompressed tar archive', () => {
    const tar = createTarArchive([
      { name: 'src/index.ts', content: 'console.log("hello");' },
      { name: 'package.json', content: '{"name": "test-pkg"}' },
    ]);

    const result = service.extract(tar);

    expect(result.fileCount).toBe(2);
    expect(result.files).toHaveLength(2);
    expect(result.files.find((f) => f.path === 'src/index.ts')?.content.toString()).toBe(
      'console.log("hello");',
    );
    expect(result.files.find((f) => f.path === 'package.json')?.content.toString()).toBe(
      '{"name": "test-pkg"}',
    );
  });

  it('successfully extracts a gzip-compressed (.tar.gz) archive', () => {
    const tarGz = createTarArchive(
      [
        { name: 'README.md', content: '# Impactra Test' },
        { name: 'src/app.ts', content: 'export const app = true;' },
      ],
      true, // gzipped
    );

    const result = service.extract(tarGz);

    expect(result.fileCount).toBe(2);
    expect(result.files.find((f) => f.path === 'README.md')?.content.toString()).toBe(
      '# Impactra Test',
    );
  });

  it('normalizes common GitHub repository prefix directory', () => {
    const tarGz = createTarArchive(
      [
        { name: 'impactra-repo-97640de/src/index.ts', content: 'const a = 1;' },
        { name: 'impactra-repo-97640de/package.json', content: '{"name": "root"}' },
      ],
      true,
    );

    const result = service.extract(tarGz);

    expect(result.files.map((f) => f.path).sort()).toEqual([
      'package.json',
      'src/index.ts',
    ]);
  });

  it('rejects archives containing symlinks', () => {
    const tar = createTarArchive([
      { name: 'safe.ts', content: 'const ok = true;' },
      { name: 'symlink.ts', typeflag: '2', content: '' },
    ]);

    expect(() => service.extract(tar)).toThrow(BadRequestException);
  });

  it('rejects archives containing hardlinks', () => {
    const tar = createTarArchive([
      { name: 'safe.ts', content: 'const ok = true;' },
      { name: 'hardlink.ts', typeflag: '1', content: '' },
    ]);

    expect(() => service.extract(tar)).toThrow(BadRequestException);
  });

  it('rejects archives containing directory traversal paths', () => {
    const tar = createTarArchive([
      { name: '../evil.sh', content: 'malicious' },
    ]);

    expect(() => service.extract(tar)).toThrow(BadRequestException);
  });

  it('rejects archives containing nested directory traversal paths', () => {
    const tar = createTarArchive([
      { name: 'src/../../secret.txt', content: 'malicious' },
    ]);

    expect(() => service.extract(tar)).toThrow(BadRequestException);
  });

  it('rejects archives containing traversal using Windows backslashes', () => {
    const tar = createTarArchive([
      { name: 'src\\..\\..\\secret.txt', content: 'malicious' },
    ]);

    expect(() => service.extract(tar)).toThrow(BadRequestException);
  });

  it('rejects archives containing absolute POSIX paths', () => {
    const tar = createTarArchive([
      { name: '/etc/passwd', content: 'root:x:0:0' },
    ]);

    expect(() => service.extract(tar)).toThrow(BadRequestException);
  });

  it('rejects archives containing Windows drive absolute paths', () => {
    const tar = createTarArchive([
      { name: 'C:\\secret.txt', content: 'secret' },
    ]);

    expect(() => service.extract(tar)).toThrow(BadRequestException);
  });

  it('correctly parses USTAR prefix + normal filename', () => {
    const tar = createTarArchive([
      { name: 'main.ts', prefix: 'src', content: 'console.log("ok");' },
    ]);

    const result = service.extract(tar);

    expect(result.fileCount).toBe(1);
    expect(result.files[0].path).toBe('src/main.ts');
  });

  it('rejects archives where USTAR prefix contains directory traversal', () => {
    const tar = createTarArchive([
      { name: 'secret.txt', prefix: '..', content: 'malicious' },
    ]);

    expect(() => service.extract(tar)).toThrow(BadRequestException);
  });

  it('preserves valid nested repository paths without stripping standard directories', () => {
    const tar = createTarArchive([
      { name: 'src/services/user.service.ts', content: 'export class UserService {}' },
    ]);

    const result = service.extract(tar);

    expect(result.fileCount).toBe(1);
    expect(result.files[0].path).toBe('src/services/user.service.ts');
  });

  it('skips folder entries without error', () => {
    const tar = createTarArchive([
      { name: 'src/', typeflag: '5' },
      { name: 'src/main.ts', content: 'console.log("main");' },
    ]);

    const result = service.extract(tar);

    expect(result.fileCount).toBe(1);
    expect(result.files[0].path).toBe('src/main.ts');
  });

  it('rejects archives with duplicate conflicting file paths', () => {
    const tar = createTarArchive([
      { name: 'src/index.ts', content: 'const a = 1;' },
      { name: 'src/index.ts', content: 'const a = 2;' },
    ]);

    expect(() => service.extract(tar)).toThrow(BadRequestException);
  });

  it('rejects malformed gzip archive data', () => {
    const corruptGzip = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xde, 0xad, 0xbe, 0xef]);
    expect(() => service.extract(corruptGzip)).toThrow(BadRequestException);
  });

  it('enforces bounded decompression limit against oversized output', () => {
    // Configure small limit
    const smallValidator = new ArchiveSecurityValidator({
      get: jest.fn((key: string) => {
        if (key === 'app.ingestion.maxExtractedBytes') return 50;
        return undefined;
      }),
    } as any);
    const smallService = new TarReaderService(smallValidator);

    const tarGz = createTarArchive(
      [{ name: 'large.txt', content: 'A'.repeat(500) }],
      true,
    );

    expect(() => smallService.extract(tarGz)).toThrow(BadRequestException);
  });
});
