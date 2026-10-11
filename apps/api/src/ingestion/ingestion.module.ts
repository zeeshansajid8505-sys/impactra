import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { CacheModule } from '../cache/cache.module';
import { SessionsModule } from '../sessions/sessions.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { GithubModule } from '../github/github.module';
import { ArchiveSecurityValidator } from './security/archive-security.validator';
import { TarReaderService } from './tar/tar-reader.service';
import { FileClassifierService } from './parsers/file-classifier.service';
import { ManifestParserService } from './parsers/manifest-parser.service';
import { ImportParserService } from './parsers/import-parser.service';
import { DigitalTwinBuilderService } from './services/digital-twin-builder.service';
import { RepositorySourceProvider } from './services/repository-source-provider.service';
import { IngestionQueueService } from './queue/ingestion-queue.service';
import { IngestionOrchestratorService } from './services/ingestion-orchestrator.service';
import { BullModule } from '@nestjs/bullmq';
import { IngestionProcessor } from './ingestion.processor';
import { OrganizationRepositoryIngestionController } from './controllers/organization-repository-ingestion.controller';

@Module({
  imports: [
    DatabaseModule,
    StorageModule,
    CacheModule,
    SessionsModule,
    OrganizationsModule,
    GithubModule,
    BullModule.registerQueue({
      name: 'repository-ingestion',
    }),
  ],
  controllers: [OrganizationRepositoryIngestionController],
  providers: [
    ArchiveSecurityValidator,
    TarReaderService,
    FileClassifierService,
    ManifestParserService,
    ImportParserService,
    DigitalTwinBuilderService,
    RepositorySourceProvider,
    IngestionQueueService,
    IngestionProcessor,
    IngestionOrchestratorService,
  ],
  exports: [
    IngestionOrchestratorService,
    RepositorySourceProvider,
    ArchiveSecurityValidator,
    TarReaderService,
    FileClassifierService,
    ManifestParserService,
    ImportParserService,
    DigitalTwinBuilderService,
  ],
})
export class IngestionModule {}
