import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PublishGitHubCheckDto {
  @ApiPropertyOptional({
    description:
      'Optional specific ReleaseSafetyAssessment ID to publish. If omitted, the latest completed assessment is published.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  assessmentId?: string;
}
