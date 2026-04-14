import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VerificationStatus } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class PatchCookVerificationStatusDto {
  @ApiProperty({ enum: VerificationStatus })
  @IsEnum(VerificationStatus)
  status: VerificationStatus;

  @ApiPropertyOptional({
    description: 'Required when status is REJECTED',
    maxLength: 2000,
  })
  @ValidateIf((o) => o.status === VerificationStatus.REJECTED)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  rejectionReason?: string;
}
