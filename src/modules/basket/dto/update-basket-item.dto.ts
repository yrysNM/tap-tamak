import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateBasketItemDto {
  @ApiProperty({ minimum: 0, maximum: 100, description: '0 removes the line from the basket' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  quantity: number;
}
