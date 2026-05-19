import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectOrderDto {
  @ApiProperty({ description: 'Cancellation reason (shown to cook or customer depending on who rejects)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}
