import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminCancelOrderDto {
  @ApiPropertyOptional({ description: 'Stored as rejectionReason for customer visibility' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectionReason?: string;
}
