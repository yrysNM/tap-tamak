import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class AddBasketItemLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  dishId: string;

  @ApiProperty({ minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quantity: number;
}

export class AddBasketItemsDto {
  @ApiProperty({ type: [AddBasketItemLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AddBasketItemLineDto)
  items: AddBasketItemLineDto[];
}
