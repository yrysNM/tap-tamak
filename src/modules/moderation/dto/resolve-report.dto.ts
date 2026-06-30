import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModerationAction } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const RESOLVE_REPORT_STATUSES = ['RESOLVED', 'DISMISSED'] as const;
export type ResolveReportStatus = (typeof RESOLVE_REPORT_STATUSES)[number];

export class ResolveContentReportDto {
  @ApiProperty({ enum: RESOLVE_REPORT_STATUSES })
  @IsIn([...RESOLVE_REPORT_STATUSES])
  status: ResolveReportStatus;

  @ApiPropertyOptional({ enum: ModerationAction })
  @IsOptional()
  @IsEnum(ModerationAction)
  action?: ModerationAction;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}
