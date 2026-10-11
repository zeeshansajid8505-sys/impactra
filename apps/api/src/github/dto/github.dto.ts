import { IsOptional, IsString, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListRepositoriesQueryDto {
  @ApiPropertyOptional({ description: 'Filter repositories by name or full name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by connected status' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  connected?: boolean;

  @ApiPropertyOptional({ description: 'Filter by availability status in GitHub' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  available?: boolean;

  @ApiPropertyOptional({ description: 'Page number for pagination', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class GitHubCallbackQueryDto {
  @ApiPropertyOptional({ description: 'GitHub App Installation ID' })
  @IsOptional()
  @IsString()
  installation_id?: string;

  @ApiPropertyOptional({ description: 'Setup action performed on GitHub' })
  @IsOptional()
  @IsString()
  setup_action?: string;

  @ApiPropertyOptional({ description: 'CSRF state passed when initiating installation' })
  @IsOptional()
  @IsString()
  state?: string;
}
