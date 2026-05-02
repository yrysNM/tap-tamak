import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsOptional, IsUUID, Matches } from 'class-validator';

const DATE_YYYY_MM_DD =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class UpdateMenuDto {
  @ApiPropertyOptional({
    example: '2026-04-16',
    description: 'Calendar date YYYY-MM-DD (UTC)',
  })
  @IsOptional()
  @Matches(DATE_YYYY_MM_DD, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  dishIds?: string[];
}
