import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'ada@impactra.internal', description: 'User email address' })
  @IsEmail({}, { message: 'Must provide a valid email address' })
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'P@ssword123!', description: 'Account password' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
