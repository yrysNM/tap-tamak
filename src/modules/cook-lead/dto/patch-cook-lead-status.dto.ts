import { ApiProperty } from '@nestjs/swagger';
import { CookLeadStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class PatchCookLeadStatusDto {
  @ApiProperty({ enum: CookLeadStatus })
  @IsEnum(CookLeadStatus)
  status: CookLeadStatus;
}
