import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const DATE_YYYY_MM_DD =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class ListMenuHistoryQueryDto {
  @ApiProperty({ example: '2026-04-01' })
  @Matches(DATE_YYYY_MM_DD, { message: 'from must be YYYY-MM-DD' })
  from!: string;

  @ApiProperty({ example: '2026-04-30' })
  @Matches(DATE_YYYY_MM_DD, { message: 'to must be YYYY-MM-DD' })
  to!: string;

  @ApiProperty({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
