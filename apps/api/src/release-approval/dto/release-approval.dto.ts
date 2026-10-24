import { IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequestReleaseApprovalDto {
  @ApiPropertyOptional({
    description:
      'Optional specific ReleaseSafetyAssessment ID to govern. If omitted, the latest completed assessment is used.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  assessmentId?: string;

  @ApiPropertyOptional({
    description: 'Optional initial reason or context for the approval request.',
    maxLength: 2000,
    example: 'Requesting release approval following peer code review.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class ResolveReleaseApprovalDto {
  @ApiProperty({
    description:
      'Required audit reason explaining the release decision. Bounded to 2000 characters.',
    maxLength: 2000,
    example:
      'All affected blast radius services verified. Test coverage confirms zero regressions.',
  })
  @IsNotEmpty({ message: 'Reason must not be empty.' })
  @IsString()
  @MaxLength(2000, { message: 'Reason must not exceed 2000 characters.' })
  reason!: string;
}

export class GrantReleaseExceptionDto {
  @ApiProperty({
    description:
      'Required justification for granting an emergency or authorized policy exception. Bounded to 2000 characters.',
    maxLength: 2000,
    example:
      'Hotfix override authorized by VP Engineering. Incident INC-4029 mitigation required immediately.',
  })
  @IsNotEmpty({ message: 'Exception reason must not be empty.' })
  @IsString()
  @MaxLength(2000, {
    message: 'Exception reason must not exceed 2000 characters.',
  })
  reason!: string;
}
