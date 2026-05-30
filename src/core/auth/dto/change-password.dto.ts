import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldSecureP@ss', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'Current password must be at least 6 characters' })
  currentPassword: string;

  @ApiProperty({ example: 'NewSecureP@ss123', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'New password must be at least 6 characters' })
  newPassword: string;
}
