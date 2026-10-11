/**
 * apps/api/test/setup-env.ts
 *
 * Test environment defaults for Jest unit and E2E test suites.
 * Supplies safe, deterministic test credentials when not already provided in process.env.
 * Does NOT override existing environment variables provided by the caller or CI.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.PORT = process.env.PORT || '3001';

// PostgreSQL test/dev database URL matching local Docker container (port 5433 on host)
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://impactra_app:impactra_local_dev_pass@localhost:5433/impactra?schema=public';

// Redis URL matching local Docker container (port 6380 on host)
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';

// MinIO S3 object storage test defaults (port 9000 on host)
process.env.MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
process.env.MINIO_PORT = process.env.MINIO_PORT || '9000';
process.env.MINIO_ACCESS_KEY =
  process.env.MINIO_ACCESS_KEY || 'impactra_minio_admin';
process.env.MINIO_SECRET_KEY =
  process.env.MINIO_SECRET_KEY || 'impactra_minio_dev_secret';
process.env.MINIO_USE_SSL = process.env.MINIO_USE_SSL || 'false';
process.env.MINIO_BUCKET = process.env.MINIO_BUCKET || 'impactra-artifacts';

// Security, CORS & Cookies
process.env.CORS_ORIGIN =
  process.env.CORS_ORIGIN || 'http://localhost:3000,http://impactra.local';
process.env.COOKIE_SECURE = process.env.COOKIE_SECURE || 'false';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';

// GitHub App Test Defaults
process.env.GITHUB_WEBHOOK_SECRET =
  process.env.GITHUB_WEBHOOK_SECRET || 'test_webhook_secret_key_123';
process.env.GITHUB_API_URL =
  process.env.GITHUB_API_URL || 'https://api.github.com';
process.env.GITHUB_WEB_URL =
  process.env.GITHUB_WEB_URL || 'https://github.com';
