import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class AddBasketItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  dishId: string;

  @ApiProperty({ minimum: 1, maximum: 100, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quantity: number;
}
