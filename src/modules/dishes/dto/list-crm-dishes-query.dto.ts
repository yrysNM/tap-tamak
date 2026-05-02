import { ApiPropertyOptional } from '@nestjs/swagger';
import { DishPreparationType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListCrmDishesQueryDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  cookId?: string;

  @ApiPropertyOptional({ enum: DishPreparationType })
  @IsOptional()
  @IsEnum(DishPreparationType)
  preparationType?: DishPreparationType;

  @ApiPropertyOptional({ description: 'Case-insensitive contains on name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}
