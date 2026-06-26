import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteAccountDto {
  @ApiProperty({ example: 'SecureP@ss123', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'Current password must be at least 6 characters' })
  currentPassword: string;
}
