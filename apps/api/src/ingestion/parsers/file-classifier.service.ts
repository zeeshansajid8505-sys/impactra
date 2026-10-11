import { Injectable } from '@nestjs/common';
import { RepositoryFileCategory } from '@impactra/shared';

export interface FileClassification {
  language: string | null;
  category: RepositoryFileCategory;
  isBinary: boolean;
}

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svgz',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'zip', 'tar', 'gz', 'tgz', '7z', 'rar', 'bz2',
  'exe', 'dll', 'so', 'dylib', 'bin', 'iso', 'wasm',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'mp3', 'wav', 'mp4', 'mov', 'avi', 'mkv',
]);

const TEST_PATH_PATTERNS = [
  /(?:^|\/)__tests__\//i,
  /(?:^|\/)test\//i,
  /(?:^|\/)tests\//i,
  /(?:^|\/)e2e\//i,
  /\.(?:test|spec)\.[a-zA-Z0-9]+$/i,
];

const CONFIG_PATH_PATTERNS = [
  /tsconfig(?:\.[a-zA-Z0-9_-]+)?\.json$/i,
  /\.eslintrc(?:\.[a-zA-Z0-9_-]+)?$/i,
  /\.prettierrc(?:\.[a-zA-Z0-9_-]+)?$/i,
  /\.editorconfig$/i,
  /jest\.config\.[a-zA-Z0-9]+$/i,
  /vite\.config\.[a-zA-Z0-9]+$/i,
  /next\.config\.[a-zA-Z0-9]+$/i,
  /tailwind\.config\.[a-zA-Z0-9]+$/i,
  /postcss\.config\.[a-zA-Z0-9]+$/i,
  /turbo\.json$/i,
  /\.env(?:\.[a-zA-Z0-9_-]+)?$/i,
];

const BUILD_PATH_PATTERNS = [
  /package\.json$/i,
  /pnpm-lock\.yaml$/i,
  /package-lock\.json$/i,
  /yarn\.lock$/i,
  /pnpm-workspace\.yaml$/i,
  /docker-compose(?:\.[a-zA-Z0-9_-]+)?\.ya?ml$/i,
  /Dockerfile(?:\.[a-zA-Z0-9_-]+)?$/i,
  /Makefile$/i,
];

const DOC_PATH_PATTERNS = [
  /^README(?:\.[a-zA-Z0-9]+)?$/i,
  /^LICENSE(?:\.[a-zA-Z0-9]+)?$/i,
  /^CHANGELOG(?:\.[a-zA-Z0-9]+)?$/i,
  /^CONTRIBUTING(?:\.[a-zA-Z0-9]+)?$/i,
  /(?:^|\/)docs?\//i,
];

@Injectable()
export class FileClassifierService {
  /**
   * Classifies a repository file into language, architectural category, and binary status.
   */
  classify(path: string, content: Buffer): FileClassification {
    const isBinary = this.detectBinary(path, content);
    if (isBinary) {
      return {
        language: null,
        category: 'BINARY',
        isBinary: true,
      };
    }

    const language = this.detectLanguage(path);
    const category = this.detectCategory(path, language);

    return {
      language,
      category,
      isBinary: false,
    };
  }

  /**
   * Detects whether a file is binary by extension and inspecting first 8KB for null bytes.
   */
  private detectBinary(path: string, content: Buffer): boolean {
    const ext = this.getExtension(path).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      return true;
    }

    // Inspect first 8000 bytes for null bytes
    const sampleSize = Math.min(content.length, 8000);
    for (let i = 0; i < sampleSize; i++) {
      if (content[i] === 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detects programming or configuration language from file extension and filename.
   */
  private detectLanguage(path: string): string | null {
    const fileName = path.split('/').pop() || path;
    const ext = this.getExtension(path).toLowerCase();

    if (fileName === 'Dockerfile' || fileName.startsWith('Dockerfile.')) {
      return 'Dockerfile';
    }

    switch (ext) {
      case 'ts':
        return 'TypeScript';
      case 'tsx':
        return 'TypeScript React';
      case 'js':
      case 'mjs':
      case 'cjs':
        return 'JavaScript';
      case 'jsx':
        return 'JavaScript React';
      case 'json':
        return 'JSON';
      case 'yaml':
      case 'yml':
        return 'YAML';
      case 'md':
      case 'markdown':
        return 'Markdown';
      case 'prisma':
        return 'Prisma';
      case 'sql':
        return 'SQL';
      case 'sh':
      case 'bash':
        return 'Shell';
      case 'ps1':
        return 'PowerShell';
      case 'html':
        return 'HTML';
      case 'css':
      case 'scss':
      case 'sass':
      case 'less':
        return 'CSS';
      case 'py':
        return 'Python';
      case 'go':
        return 'Go';
      case 'rs':
        return 'Rust';
      case 'java':
        return 'Java';
      case 'toml':
        return 'TOML';
      case 'xml':
        return 'XML';
      case 'csv':
        return 'CSV';
      default:
        return null;
    }
  }

  /**
   * Categorizes the role of the file within the software project.
   */
  private detectCategory(path: string, language: string | null): RepositoryFileCategory {
    // 1. Build system files
    for (const pattern of BUILD_PATH_PATTERNS) {
      if (pattern.test(path)) {
        return 'BUILD_SYSTEM';
      }
    }

    // 2. Test files
    for (const pattern of TEST_PATH_PATTERNS) {
      if (pattern.test(path)) {
        return 'TEST';
      }
    }

    // 3. Documentation
    for (const pattern of DOC_PATH_PATTERNS) {
      if (pattern.test(path)) {
        return 'DOCUMENTATION';
      }
    }
    if (language === 'Markdown') {
      return 'DOCUMENTATION';
    }

    // 4. Configuration
    for (const pattern of CONFIG_PATH_PATTERNS) {
      if (pattern.test(path)) {
        return 'CONFIGURATION';
      }
    }

    // 5. Data files
    const ext = this.getExtension(path).toLowerCase();
    if (['csv', 'tsv'].includes(ext) || (ext === 'json' && path.includes('data/'))) {
      return 'DATA';
    }

    // 6. Source code
    if (
      language &&
      [
        'TypeScript',
        'TypeScript React',
        'JavaScript',
        'JavaScript React',
        'Python',
        'Go',
        'Rust',
        'Java',
        'SQL',
        'Prisma',
      ].includes(language)
    ) {
      return 'SOURCE_CODE';
    }

    if (['JSON', 'YAML', 'TOML'].includes(language || '')) {
      return 'CONFIGURATION';
    }

    return 'OTHER';
  }

  private getExtension(path: string): string {
    const fileName = path.split('/').pop() || path;
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex === -1 || dotIndex === 0) return '';
    return fileName.substring(dotIndex + 1);
  }
}
