import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  IsInt,
  Min,
  Max,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  RepositoryIngestionStatus,
  DigitalTwinNodeTypeEnum,
  DigitalTwinEdgeType,
} from '@impactra/shared';

export class TriggerIngestionDto {
  @ApiPropertyOptional({
    description: 'Target branch or tag reference to ingest (defaults to repository default branch)',
    example: 'main',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9_\-\.\/]+$/, {
    message: 'ref may only contain alphanumeric characters, slashes, dashes, underscores, and dots',
  })
  ref?: string;

  @ApiPropertyOptional({
    description: 'Exact 7-40 character hexadecimal commit SHA to ingest',
    example: '97640defa1234567890abcdef1234567890abcde',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-fA-F]{7,40}$/, {
    message: 'commitSha must be a 7-40 character hexadecimal string',
  })
  commitSha?: string;
}

export class ListIngestionsQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page size limit', default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by ingestion status',
    enum: [
      'QUEUED',
      'FETCHING',
      'VALIDATING',
      'INDEXING',
      'BUILDING_TWIN',
      'STORING',
      'SUCCEEDED',
      'FAILED',
    ],
  })
  @IsOptional()
  @IsEnum([
    'QUEUED',
    'FETCHING',
    'VALIDATING',
    'INDEXING',
    'BUILDING_TWIN',
    'STORING',
    'SUCCEEDED',
    'FAILED',
  ])
  status?: RepositoryIngestionStatus;
}

export class ListTwinNodesQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page size limit', default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Filter by node type',
    enum: ['REPOSITORY', 'FILE', 'WORKSPACE_PACKAGE', 'EXTERNAL_DEPENDENCY', 'CONFIG'],
  })
  @IsOptional()
  @IsEnum(['REPOSITORY', 'FILE', 'WORKSPACE_PACKAGE', 'EXTERNAL_DEPENDENCY', 'CONFIG'])
  type?: DigitalTwinNodeTypeEnum;

  @ApiPropertyOptional({
    description: 'Search substring filter matching node name, path, or stableKey',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class ListTwinEdgesQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page size limit', default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Filter by edge type',
    enum: ['CONTAINS', 'IMPORTS', 'DECLARES_DEPENDENCY', 'WORKSPACE_DEPENDS_ON'],
  })
  @IsOptional()
  @IsEnum(['CONTAINS', 'IMPORTS', 'DECLARES_DEPENDENCY', 'WORKSPACE_DEPENDS_ON'])
  type?: DigitalTwinEdgeType;

  @ApiPropertyOptional({ description: 'Filter by source node ID' })
  @IsOptional()
  @IsString()
  sourceNodeId?: string;

  @ApiPropertyOptional({ description: 'Filter by target node ID' })
  @IsOptional()
  @IsString()
  targetNodeId?: string;
}
