import { IsEmail, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MembershipRole } from '@impactra/shared';

export class InviteMemberDto {
  @ApiProperty({ example: 'colleague@impactra.internal', description: 'Member corporate email' })
  @IsEmail({}, { message: 'Must provide a valid email address' })
  @IsNotEmpty()
  email!: string;

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
    example: 'DEVELOPER',
    description: 'Assigned organizational role',
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
