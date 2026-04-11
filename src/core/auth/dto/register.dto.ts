import {
  IsString,
  IsEnum,
  MinLength,
  Matches,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

const PHONE_REGEX = /^\+?[0-9\s\-()]{10,20}$/;

const PUBLIC_ROLES = [Role.USER, Role.COOK] as const;
type PublicRole = (typeof PUBLIC_ROLES)[number];

export class RegisterDto {
  @ApiProperty({ example: '+7 700 123 4567' })
  @IsString()
  @IsNotEmpty()
  @Matches(PHONE_REGEX, { message: 'Phone must be a valid phone number' })
  phone: string;

  @ApiProperty({ example: 'SecureP@ss123', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ enum: PUBLIC_ROLES, default: Role.USER })
  @IsEnum(PUBLIC_ROLES, { message: 'Role must be USER or COOK' })
  role: PublicRole = Role.USER;
}
