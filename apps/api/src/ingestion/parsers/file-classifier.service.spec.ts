import { FileClassifierService } from './file-classifier.service';

describe('FileClassifierService', () => {
  let classifier: FileClassifierService;

  beforeEach(() => {
    classifier = new FileClassifierService();
  });

  it('correctly classifies TypeScript source files', () => {
    const content = Buffer.from('export const answer: number = 42;');
    const res = classifier.classify('src/services/answer.service.ts', content);
    expect(res.language).toBe('TypeScript');
    expect(res.category).toBe('SOURCE_CODE');
    expect(res.isBinary).toBe(false);
  });

  it('correctly classifies test files', () => {
    const content = Buffer.from('describe("test", () => {});');
    const res = classifier.classify('src/services/answer.service.spec.ts', content);
    expect(res.language).toBe('TypeScript');
    expect(res.category).toBe('TEST');
  });

  it('correctly classifies build system manifests', () => {
    const pkgJson = Buffer.from('{"name": "root"}');
    const res = classifier.classify('package.json', pkgJson);
    expect(res.language).toBe('JSON');
    expect(res.category).toBe('BUILD_SYSTEM');

    const dockerfile = Buffer.from('FROM node:22-alpine');
    const dRes = classifier.classify('Dockerfile', dockerfile);
    expect(dRes.language).toBe('Dockerfile');
    expect(dRes.category).toBe('BUILD_SYSTEM');
  });

  it('correctly classifies configuration files', () => {
    const tsconfig = Buffer.from('{"compilerOptions": {}}');
    const res = classifier.classify('tsconfig.json', tsconfig);
    expect(res.language).toBe('JSON');
    expect(res.category).toBe('CONFIGURATION');

    const yamlConfig = Buffer.from('foo: bar');
    const yRes = classifier.classify('config.yaml', yamlConfig);
    expect(yRes.language).toBe('YAML');
    expect(yRes.category).toBe('CONFIGURATION');
  });

  it('correctly classifies documentation files', () => {
    const readme = Buffer.from('# Impactra Platform');
    const res = classifier.classify('README.md', readme);
    expect(res.language).toBe('Markdown');
    expect(res.category).toBe('DOCUMENTATION');
  });

  it('detects binary files via extension and null bytes', () => {
    const pngContent = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const res = classifier.classify('assets/logo.png', pngContent);
    expect(res.isBinary).toBe(true);
    expect(res.category).toBe('BINARY');

    const binaryText = Buffer.from([65, 66, 0, 68]); // contains null byte
    const bRes = classifier.classify('data/mystery.dat', binaryText);
    expect(bRes.isBinary).toBe(true);
    expect(bRes.category).toBe('BINARY');
  });
});
