import { IsString, MinLength, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const PHONE_REGEX = /^\+?[0-9\s\-()]{10,20}$/;

export class LoginDto {
  @ApiProperty({ example: '+7 700 123 4567' })
  @IsString()
  @IsNotEmpty()
  @Matches(PHONE_REGEX, { message: 'Phone must be a valid phone number' })
  phone: string;

  @ApiProperty({ example: 'SecureP@ss123', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;
}
