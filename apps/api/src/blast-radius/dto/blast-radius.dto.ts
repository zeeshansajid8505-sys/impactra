import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  BlastRadiusCategory,
  BlastRadiusImpactClass,
  BlastRadiusSnapshotSide,
  BlastRadiusAnalysisStatus,
} from '@impactra/shared';

export class TriggerBlastRadiusDto {
  @ApiPropertyOptional({
    description: 'Force re-running blast radius analysis even if an analysis already succeeded',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean = false;
}

export class ListFindingsQueryDto {
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
    description: 'Filter by blast radius category',
    enum: BlastRadiusCategory,
  })
  @IsOptional()
  @IsEnum(BlastRadiusCategory)
  category?: BlastRadiusCategory;

  @ApiPropertyOptional({
    description: 'Filter by impact class',
    enum: BlastRadiusImpactClass,
  })
  @IsOptional()
  @IsEnum(BlastRadiusImpactClass)
  impactClass?: BlastRadiusImpactClass;

  @ApiPropertyOptional({ description: 'Filter by specific traversal depth', minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  depth?: number;

  @ApiPropertyOptional({
    description: 'Filter by snapshot side (BASE or HEAD)',
    enum: BlastRadiusSnapshotSide,
  })
  @IsOptional()
  @IsEnum(BlastRadiusSnapshotSide)
  snapshotSide?: BlastRadiusSnapshotSide;

  @ApiPropertyOptional({ description: 'Search stableKey or node name' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class ListEvidencePathsQueryDto {
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

  @ApiPropertyOptional({ description: 'Filter by finding ID' })
  @IsOptional()
  @IsString()
  findingId?: string;

  @ApiPropertyOptional({ description: 'Filter by root stableKey' })
  @IsOptional()
  @IsString()
  rootStableKey?: string;

  @ApiPropertyOptional({ description: 'Filter by affected entity stableKey' })
  @IsOptional()
  @IsString()
  affectedStableKey?: string;
}

export class ListAnalysesQueryDto {
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

  @ApiPropertyOptional({ description: 'Filter by repository connection ID' })
  @IsOptional()
  @IsString()
  repositoryId?: string;

  @ApiPropertyOptional({
    description: 'Filter by analysis status',
    enum: BlastRadiusAnalysisStatus,
  })
  @IsOptional()
  @IsEnum(BlastRadiusAnalysisStatus)
  status?: BlastRadiusAnalysisStatus;
}
