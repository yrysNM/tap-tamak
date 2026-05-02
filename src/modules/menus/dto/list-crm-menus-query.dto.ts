import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

const DATE_YYYY_MM_DD =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class ListCrmMenusQueryDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DATE_YYYY_MM_DD, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DATE_YYYY_MM_DD, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}
