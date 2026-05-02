import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class GetCookMenuInfoQueryDto {
  @ApiPropertyOptional({
    description: 'Menu date in UTC calendar format YYYY-MM-DD. Defaults to today (UTC).',
    example: '2026-04-29',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date?: string;
}
