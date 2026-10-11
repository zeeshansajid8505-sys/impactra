import { registerAs } from '@nestjs/config';

export default registerAs('app', () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  let cookieSecure: boolean;
  if (process.env.COOKIE_SECURE !== undefined) {
    const raw = process.env.COOKIE_SECURE.trim().toLowerCase();
    cookieSecure = raw === 'true' || raw === '1';
  } else {
    cookieSecure = nodeEnv === 'production';
  }

  return {
    nodeEnv,
    port: parseInt(process.env.PORT || '3001', 10),
    cookieSecure,
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    minio: {
      endpoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000', 10),
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      bucket: process.env.MINIO_BUCKET || 'impactra-artifacts',
    },
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000,http://impactra.local',
    logLevel: process.env.LOG_LEVEL || 'info',
    github: {
      appId: process.env.GITHUB_APP_ID,
      appSlug: process.env.GITHUB_APP_SLUG,
      privateKeyBase64: process.env.GITHUB_APP_PRIVATE_KEY_BASE64,
      webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
      apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
      webUrl: process.env.GITHUB_WEB_URL || 'https://github.com',
    },
  };
});
