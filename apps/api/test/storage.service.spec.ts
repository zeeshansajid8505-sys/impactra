import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../src/storage/storage.service';
import { ListBucketsCommand } from '@aws-sdk/client-s3';

jest.mock('@aws-sdk/client-s3');

describe('StorageService (Dual MinIO & S3 Configuration)', () => {
  let service: StorageService;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes successfully with local MinIO configuration', () => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, unknown> = {
          'app.minio.endpoint': 'localhost',
          'app.minio.port': 9000,
          'app.minio.accessKey': 'minio_user',
          'app.minio.secretKey': 'minio_secret',
          'app.minio.useSSL': false,
          'app.minio.bucket': 'impactra-artifacts',
        };
        return config[key];
      }),
    };

    service = new StorageService(mockConfigService as ConfigService);
    service.onModuleInit();

    expect(service.client).toBeDefined();
  });

  it('initializes successfully with production S3-compatible configuration', () => {
    const originalEnv = { ...process.env };
    process.env.STORAGE_ENDPOINT = 'https://s3.eu-west-1.amazonaws.com';
    process.env.STORAGE_REGION = 'eu-west-1';
    process.env.STORAGE_BUCKET = 'impactra-prod-artifacts';
    process.env.STORAGE_ACCESS_KEY = 'prod_access_key';
    process.env.STORAGE_SECRET_KEY = 'prod_secret_key';
    process.env.STORAGE_FORCE_PATH_STYLE = 'false';

    try {
      mockConfigService = {
        get: jest.fn().mockReturnValue(undefined),
      };

      service = new StorageService(mockConfigService as ConfigService);
      service.onModuleInit();

      expect(service.client).toBeDefined();
    } finally {
      process.env = originalEnv;
    }
  });

  it('reports healthy ping status when S3Client responds', async () => {
    mockConfigService = {
      get: jest.fn().mockReturnValue('test-value'),
    };

    service = new StorageService(mockConfigService as ConfigService);
    service.onModuleInit();

    const mockSend = jest.fn().mockResolvedValue({});
    (service as any).s3Client = { send: mockSend };

    const status = await service.ping();
    expect(status.status).toBe('healthy');
    expect(typeof status.latencyMs).toBe('number');
  });

  it('reports unhealthy status when S3Client throws an error', async () => {
    mockConfigService = {
      get: jest.fn().mockReturnValue('test-value'),
    };

    service = new StorageService(mockConfigService as ConfigService);
    service.onModuleInit();

    const mockSend = jest.fn().mockRejectedValue(new Error('Connection refused'));
    (service as any).s3Client = { send: mockSend };

    const status = await service.ping();
    expect(status.status).toBe('unhealthy');
    expect(status.error).toContain('Connection refused');
  });
});
