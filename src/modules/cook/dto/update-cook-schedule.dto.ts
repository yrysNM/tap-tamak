import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, Matches } from 'class-validator';

export class UpdateCookScheduleDto {
  @ApiProperty({
    example: '2026-04-26T08:00:00.000Z',
    description: 'Schedule start datetime in UTC (ISO 8601).',
  })
  @IsISO8601({ strict: true })
  @Matches(/Z$/, { message: 'workStartAt must be UTC and end with Z' })
  workStartAt!: string;

  @ApiProperty({
    example: '2026-04-26T18:00:00.000Z',
    description: 'Schedule end datetime in UTC (ISO 8601).',
  })
  @IsISO8601({ strict: true })
  @Matches(/Z$/, { message: 'workEndAt must be UTC and end with Z' })
  workEndAt!: string;
}
