import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PasswordResetRequestDto {
  @ApiProperty({ example: 'ada@impactra.internal', description: 'User account email' })
  @IsEmail({}, { message: 'Must provide a valid email address' })
  @IsNotEmpty()
  email!: string;
}

export class PasswordResetConfirmDto {
  @ApiProperty({ description: 'Secret reset token received from reset flow' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({
    example: 'NewSecurePassword456!',
    description: 'New password meeting complexity criteria',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
