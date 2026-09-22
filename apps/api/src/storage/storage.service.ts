import {
  Injectable,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  ListBucketsCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { DependencyStatus } from '@impactra/shared';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client | null = null;
  private bucketName: string;

  constructor(private readonly configService: ConfigService) {
    this.bucketName =
      this.configService.get<string>('app.minio.bucket') ||
      process.env.MINIO_BUCKET ||
      'impactra-artifacts';
  }

  onModuleInit(): void {
    const endpointHost =
      this.configService.get<string>('app.minio.endpoint') ||
      process.env.MINIO_ENDPOINT ||
      'localhost';
    const port =
      this.configService.get<number>('app.minio.port') ||
      parseInt(process.env.MINIO_PORT || '9000', 10);
    const useSSL =
      this.configService.get<boolean>('app.minio.useSSL') ??
      process.env.MINIO_USE_SSL === 'true';
    const accessKey =
      this.configService.get<string>('app.minio.accessKey') ||
      process.env.MINIO_ACCESS_KEY ||
      '';
    const secretKey =
      this.configService.get<string>('app.minio.secretKey') ||
      process.env.MINIO_SECRET_KEY ||
      '';

    const protocol = useSSL ? 'https' : 'http';
    const endpoint = `${protocol}://${endpointHost}:${port}`;

    try {
      this.s3Client = new S3Client({
        endpoint,
        region: 'us-east-1',
        credentials: {
          accessKeyId: accessKey,
          secretAccessKey: secretKey,
        },
        forcePathStyle: true, // Required for MinIO
      });

      this.logger.log(`MinIO storage client initialized for ${endpoint}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to initialize MinIO S3 client: ${msg}`);
    }
  }

  get client(): S3Client | null {
    return this.s3Client;
  }

  async ensureBucket(): Promise<void> {
    if (!this.s3Client) return;

    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucketName }));
    } catch (headErr: unknown) {
      const isNotFound =
        (headErr as { name?: string })?.name === 'NotFound' ||
        (headErr as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404;

      if (isNotFound) {
        try {
          await this.s3Client.send(
            new CreateBucketCommand({ Bucket: this.bucketName }),
          );
          this.logger.log(`Created default MinIO bucket: ${this.bucketName}`);
        } catch (createErr: unknown) {
          const msg =
            createErr instanceof Error ? createErr.message : String(createErr);
          this.logger.warn(`Could not create bucket ${this.bucketName}: ${msg}`);
        }
      }
    }
  }

  async ping(): Promise<DependencyStatus> {
    if (!this.s3Client) {
      return { status: 'unhealthy', error: 'MinIO S3 client not initialized' };
    }

    const start = Date.now();
    try {
      await this.s3Client.send(new ListBucketsCommand({}));
      return {
        status: 'healthy',
        latencyMs: Date.now() - start,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'MinIO ping failed';
      return {
        status: 'unhealthy',
        error: msg,
      };
    }
  }
}
