import { ApiPropertyOptional } from '@nestjs/swagger';
import { DishPreparationType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateDishFormDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  cookingTime?: number;

  @ApiPropertyOptional({ enum: DishPreparationType })
  @IsOptional()
  @IsEnum(DishPreparationType)
  preparationType?: DishPreparationType;

  @ApiPropertyOptional({ description: 'Price in KZT (integer)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ description: 'Comma-separated tags' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  tags?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  calories?: number;

  @ApiPropertyOptional({ description: 'Number of portions/servings this dish covers' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  portionCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === '') return undefined;
    return value === true || value === 'true';
  })
  @IsBoolean()
  isAvailable?: boolean;
}
