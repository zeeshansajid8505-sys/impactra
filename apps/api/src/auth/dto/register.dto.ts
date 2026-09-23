import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Ada Lovelace', description: 'User full name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'ada@impactra.internal', description: 'Corporate email address' })
  @IsEmail({}, { message: 'Must provide a valid corporate email address' })
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    example: 'P@ssword123!',
    description: 'Strong password (minimum 8 characters, with upper, lower, and digit/special)',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters in length' })
  @MaxLength(128, { message: 'Password cannot exceed 128 characters' })
  password!: string;
}
