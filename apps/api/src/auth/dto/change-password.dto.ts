import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPassword123!', description: 'Current password' })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({
    example: 'NewSecurePassword456!',
    description: 'New password (min 8 chars, with uppercase, lowercase, and digit/symbol)',
  })
  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters in length' })
  @MaxLength(128, { message: 'New password cannot exceed 128 characters' })
  newPassword!: string;
}
