import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class AcceptCookOrderDto {
  @ApiProperty({ description: 'Estimated preparation time in minutes (shown to the customer)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  preparationTimeMinutes!: number;
}
