import { validateEnv } from './env.schema';

describe('envSchema - Blast Radius Configuration', () => {
  const baseConfig = {
    DATABASE_URL: 'postgresql://test_user:test_password@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    MINIO_ACCESS_KEY: 'test_minio_access_key',
    MINIO_SECRET_KEY: 'test_minio_secret_key',
  };

  it('provides default blast radius configuration values when omitted', () => {
    const config = validateEnv(baseConfig);
    expect(config.BLAST_RADIUS_MAX_DEPTH).toBe(5);
    expect(config.BLAST_RADIUS_MAX_AFFECTED_NODES).toBe(5000);
    expect(config.BLAST_RADIUS_MAX_EVIDENCE_PATHS).toBe(10000);
  });

  it('accepts valid custom blast radius configuration values (strings or numbers)', () => {
    const config = validateEnv({
      ...baseConfig,
      BLAST_RADIUS_MAX_DEPTH: '10',
      BLAST_RADIUS_MAX_AFFECTED_NODES: 2500,
      BLAST_RADIUS_MAX_EVIDENCE_PATHS: '8000',
    });
    expect(config.BLAST_RADIUS_MAX_DEPTH).toBe(10);
    expect(config.BLAST_RADIUS_MAX_AFFECTED_NODES).toBe(2500);
    expect(config.BLAST_RADIUS_MAX_EVIDENCE_PATHS).toBe(8000);
  });

  it('rejects BLAST_RADIUS_MAX_DEPTH out of bounds', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        BLAST_RADIUS_MAX_DEPTH: 0,
      }),
    ).toThrow('Invalid Environment Configuration');

    expect(() =>
      validateEnv({
        ...baseConfig,
        BLAST_RADIUS_MAX_DEPTH: 51,
      }),
    ).toThrow('Invalid Environment Configuration');
  });

  it('rejects BLAST_RADIUS_MAX_AFFECTED_NODES out of bounds', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        BLAST_RADIUS_MAX_AFFECTED_NODES: 0,
      }),
    ).toThrow('Invalid Environment Configuration');

    expect(() =>
      validateEnv({
        ...baseConfig,
        BLAST_RADIUS_MAX_AFFECTED_NODES: 100001,
      }),
    ).toThrow('Invalid Environment Configuration');
  });

  it('rejects BLAST_RADIUS_MAX_EVIDENCE_PATHS out of bounds', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        BLAST_RADIUS_MAX_EVIDENCE_PATHS: 0,
      }),
    ).toThrow('Invalid Environment Configuration');

    expect(() =>
      validateEnv({
        ...baseConfig,
        BLAST_RADIUS_MAX_EVIDENCE_PATHS: 100001,
      }),
    ).toThrow('Invalid Environment Configuration');
  });
});
