import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MembershipRole } from '@impactra/shared';

export class UpdateMemberRoleDto {
  @ApiProperty({
    enum: [
      'OWNER',
      'ADMIN',
      'ARCHITECT',
      'SECURITY_ENGINEER',
      'DEVELOPER',
      'RELEASE_MANAGER',
      'QA_ENGINEER',
      'AUDITOR',
      'VIEWER',
    ],
    example: 'ADMIN',
    description: 'Updated organizational role',
  })
  @IsEnum(
    [
      'OWNER',
      'ADMIN',
      'ARCHITECT',
      'SECURITY_ENGINEER',
      'DEVELOPER',
      'RELEASE_MANAGER',
      'QA_ENGINEER',
      'AUDITOR',
      'VIEWER',
    ],
    { message: 'Invalid membership role' },
  )
  @IsNotEmpty()
  role!: MembershipRole;
}
