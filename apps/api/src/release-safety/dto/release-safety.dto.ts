import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ReleaseSafetySignalCategory,
  ReleaseSafetySignalSeverity,
  ReleaseSafetyDecision,
  ReleaseRiskLevel,
  ReleaseSafetyAssessmentStatus,
} from '@impactra/shared';

export class EvaluateReleaseSafetyDto {
  @ApiPropertyOptional({
    description: 'Force re-evaluation even if an assessment already succeeded',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean = false;
}

export class ListReleaseSafetySignalsQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Page size limit',
    default: 50,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Filter by signal category',
    enum: ReleaseSafetySignalCategory,
  })
  @IsOptional()
  @IsEnum(ReleaseSafetySignalCategory)
  category?: ReleaseSafetySignalCategory;

  @ApiPropertyOptional({
    description: 'Filter by signal severity',
    enum: ReleaseSafetySignalSeverity,
  })
  @IsOptional()
  @IsEnum(ReleaseSafetySignalSeverity)
  severity?: ReleaseSafetySignalSeverity;

  @ApiPropertyOptional({
    description: 'Filter by whether signal is blocking',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  blocking?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by whether signal mandates review',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  requiresReview?: boolean;
}

export class ListReleaseSafetyAssessmentsQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Page size limit',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by release decision',
    enum: ReleaseSafetyDecision,
  })
  @IsOptional()
  @IsEnum(ReleaseSafetyDecision)
  decision?: ReleaseSafetyDecision;

  @ApiPropertyOptional({
    description: 'Filter by risk level',
    enum: ReleaseRiskLevel,
  })
  @IsOptional()
  @IsEnum(ReleaseRiskLevel)
  riskLevel?: ReleaseRiskLevel;

  @ApiPropertyOptional({
    description: 'Filter by assessment status',
    enum: ReleaseSafetyAssessmentStatus,
  })
  @IsOptional()
  @IsEnum(ReleaseSafetyAssessmentStatus)
  status?: ReleaseSafetyAssessmentStatus;
}
