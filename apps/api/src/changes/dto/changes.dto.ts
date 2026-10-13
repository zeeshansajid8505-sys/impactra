import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  ChangedFileStatus,
  TwinMappingType,
  DependencyDeltaType,
} from '@impactra/shared';

export class ListChangeSetsQueryDto {
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

  @ApiPropertyOptional({ description: 'Filter by status (OPEN, CLOSED, MERGED)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Search title or branch' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class ListChangeRevisionsQueryDto {
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
}

export class ListChangedFilesQueryDto {
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

  @ApiPropertyOptional({ enum: ChangedFileStatus, description: 'Filter by file status' })
  @IsOptional()
  @IsEnum(ChangedFileStatus)
  status?: ChangedFileStatus;
}

export class ListTwinChangeMappingsQueryDto {
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

  @ApiPropertyOptional({ enum: TwinMappingType, description: 'Filter by mapping type' })
  @IsOptional()
  @IsEnum(TwinMappingType)
  mappingType?: TwinMappingType;
}

export class ListDependencyDeltasQueryDto {
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

  @ApiPropertyOptional({ enum: DependencyDeltaType, description: 'Filter by delta type' })
  @IsOptional()
  @IsEnum(DependencyDeltaType)
  deltaType?: DependencyDeltaType;
}

export class SyncPullRequestDto {
  @ApiProperty({ description: 'Pull request number to synchronize', example: 42 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  prNumber!: number;
}
