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
});

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
