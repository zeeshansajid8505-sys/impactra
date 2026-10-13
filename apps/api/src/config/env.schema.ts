import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required' })
    .min(1, 'DATABASE_URL cannot be empty'),
  REDIS_URL: z
    .string({ required_error: 'REDIS_URL is required' })
    .min(1, 'REDIS_URL cannot be empty'),
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_ACCESS_KEY: z
    .string({ required_error: 'MINIO_ACCESS_KEY is required' })
    .min(1, 'MINIO_ACCESS_KEY cannot be empty'),
  MINIO_SECRET_KEY: z
    .string({ required_error: 'MINIO_SECRET_KEY is required' })
    .min(1, 'MINIO_SECRET_KEY cannot be empty'),
  MINIO_USE_SSL: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        return val.toLowerCase() === 'true' || val === '1';
      }
      return Boolean(val);
    }, z.boolean())
    .default(false),
  MINIO_BUCKET: z.string().default('impactra-artifacts'),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000,http://impactra.local'),
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .default('info'),
  COOKIE_SECURE: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        const lower = val.trim().toLowerCase();
        if (lower === 'true' || lower === '1') return true;
        if (lower === 'false' || lower === '0') return false;
      }
      return val;
    }, z.boolean().optional())
    .optional(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_SLUG: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY_BASE64: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_API_URL: z.string().url().default('https://api.github.com'),
  GITHUB_WEB_URL: z.string().url().default('https://github.com'),
  INGESTION_MAX_ARCHIVE_BYTES: z.coerce.number().int().positive().default(52428800), // 50MB
  INGESTION_MAX_EXTRACTED_BYTES: z.coerce.number().int().positive().default(262144000), // 250MB
  INGESTION_MAX_FILE_BYTES: z.coerce.number().int().positive().default(5242880), // 5MB
  INGESTION_MAX_FILE_COUNT: z.coerce.number().int().positive().default(10000),
  INGESTION_MAX_PATH_DEPTH: z.coerce.number().int().positive().default(20),
  INGESTION_MAX_PATH_LENGTH: z.coerce.number().int().positive().default(255),
  CHANGE_MAX_FILES: z.coerce.number().int().positive().default(1000),
  CHANGE_MAX_PATCH_BYTES_PER_FILE: z.coerce.number().int().positive().default(262144), // 256KB
  CHANGE_MAX_TOTAL_PATCH_BYTES: z.coerce.number().int().positive().default(10485760), // 10MB
  CHANGE_ANALYSIS_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(300),
}).transform((data) => ({
  ...data,
  COOKIE_SECURE:
    data.COOKIE_SECURE !== undefined
      ? data.COOKIE_SECURE
      : data.NODE_ENV === 'production',
}));

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `\n========================================\n❌ Invalid Environment Configuration:\n${issues}\n========================================\n`,
    );
  }
  return parsed.data;
}
