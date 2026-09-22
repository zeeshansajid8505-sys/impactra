import { validateEnv } from '../src/config/env.schema';

describe('validateEnv', () => {
  const validBaseEnv = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/impactra',
    REDIS_URL: 'redis://localhost:6379',
    MINIO_ACCESS_KEY: 'minioadmin',
    MINIO_SECRET_KEY: 'minioadminsecret',
  };

  it('should parse and validate valid environment variables with correct defaults', () => {
    const result = validateEnv(validBaseEnv);

    expect(result.DATABASE_URL).toBe(validBaseEnv.DATABASE_URL);
    expect(result.REDIS_URL).toBe(validBaseEnv.REDIS_URL);
    expect(result.MINIO_ACCESS_KEY).toBe(validBaseEnv.MINIO_ACCESS_KEY);
    expect(result.MINIO_SECRET_KEY).toBe(validBaseEnv.MINIO_SECRET_KEY);
    expect(result.PORT).toBe(3001);
    expect(result.NODE_ENV).toBe('development');
    expect(result.MINIO_PORT).toBe(9000);
    expect(result.MINIO_ENDPOINT).toBe('localhost');
    expect(result.MINIO_USE_SSL).toBe(false);
  });

  it('should coerce string port and boolean ssl properly', () => {
    const customEnv = {
      ...validBaseEnv,
      PORT: '3005',
      MINIO_PORT: '9005',
      MINIO_USE_SSL: 'true',
      NODE_ENV: 'production',
    };

    const result = validateEnv(customEnv);
    expect(result.PORT).toBe(3005);
    expect(result.MINIO_PORT).toBe(9005);
    expect(result.MINIO_USE_SSL).toBe(true);
    expect(result.NODE_ENV).toBe('production');
  });

  it('should fail fast with a descriptive error when required variables are missing', () => {
    expect(() => validateEnv({})).toThrow(/Invalid Environment Configuration/);
  });

  it('should identify DATABASE_URL as required when missing or empty', () => {
    const { DATABASE_URL, ...missingEnv } = validBaseEnv;
    expect(() => validateEnv(missingEnv)).toThrow(/DATABASE_URL.*(required|cannot be empty)/i);
    expect(() => validateEnv({ ...validBaseEnv, DATABASE_URL: '' })).toThrow(/DATABASE_URL.*(required|cannot be empty)/i);
  });

  it('should identify REDIS_URL as required when missing or empty', () => {
    const { REDIS_URL, ...missingEnv } = validBaseEnv;
    expect(() => validateEnv(missingEnv)).toThrow(/REDIS_URL.*(required|cannot be empty)/i);
    expect(() => validateEnv({ ...validBaseEnv, REDIS_URL: '' })).toThrow(/REDIS_URL.*(required|cannot be empty)/i);
  });

  it('should identify MINIO credentials as required when missing or empty', () => {
    const { MINIO_ACCESS_KEY, ...missingAccess } = validBaseEnv;
    expect(() => validateEnv(missingAccess)).toThrow(/MINIO_ACCESS_KEY.*(required|cannot be empty)/i);

    const { MINIO_SECRET_KEY, ...missingSecret } = validBaseEnv;
    expect(() => validateEnv(missingSecret)).toThrow(/MINIO_SECRET_KEY.*(required|cannot be empty)/i);
  });
});
