import { ApiPropertyOptional } from '@nestjs/swagger';
import { CookLeadStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListCookLeadsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: CookLeadStatus })
  @IsOptional()
  @IsEnum(CookLeadStatus)
  status?: CookLeadStatus;

  @ApiPropertyOptional({ description: 'Case-insensitive contains match on email' })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;
}
