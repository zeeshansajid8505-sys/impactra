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
    ingestion: {
      maxArchiveBytes: parseInt(process.env.INGESTION_MAX_ARCHIVE_BYTES || '52428800', 10),
      maxExtractedBytes: parseInt(process.env.INGESTION_MAX_EXTRACTED_BYTES || '262144000', 10),
      maxFileBytes: parseInt(process.env.INGESTION_MAX_FILE_BYTES || '5242880', 10),
      maxFileCount: parseInt(process.env.INGESTION_MAX_FILE_COUNT || '10000', 10),
      maxPathDepth: parseInt(process.env.INGESTION_MAX_PATH_DEPTH || '20', 10),
      maxPathLength: parseInt(process.env.INGESTION_MAX_PATH_LENGTH || '255', 10),
    },
    changes: {
      maxFiles: parseInt(process.env.CHANGE_MAX_FILES || '1000', 10),
      maxPatchBytesPerFile: parseInt(process.env.CHANGE_MAX_PATCH_BYTES_PER_FILE || '262144', 10),
      maxTotalPatchBytes: parseInt(process.env.CHANGE_MAX_TOTAL_PATCH_BYTES || '10485760', 10),
      analysisTimeoutSeconds: parseInt(process.env.CHANGE_ANALYSIS_TIMEOUT_SECONDS || '300', 10),
    },
    blastRadius: {
      maxDepth: parseInt(process.env.BLAST_RADIUS_MAX_DEPTH || '5', 10),
      maxAffectedNodes: parseInt(process.env.BLAST_RADIUS_MAX_AFFECTED_NODES || '5000', 10),
      maxEvidencePaths: parseInt(process.env.BLAST_RADIUS_MAX_EVIDENCE_PATHS || '10000', 10),
    },
  };
});
