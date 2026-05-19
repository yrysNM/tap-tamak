import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/** Multipart checkout: same as JSON checkout without courier comment. */
export class CheckoutMultipartFormDto {
  @ApiProperty({ example: 'Алматы, ул. Абая, 150' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  addressLine!: string;

  @ApiPropertyOptional({ description: 'Required when saveAddress is true' })
  @ValidateIf((o: CheckoutMultipartFormDto) => o.saveAddress === true)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  entrance?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  intercom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  floor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  apartment?: string;

  @ApiProperty({ example: '+7 700 000 00 00' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  contactPhone!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? false
      : value === true || value === 'true',
  )
  @IsBoolean()
  saveAddress?: boolean;

  @ApiPropertyOptional({ description: 'Label when saving address (e.g. Дом)' })
  @ValidateIf((o: CheckoutMultipartFormDto) => o.saveAddress === true)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  savedAddressLabel?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountAmount?: number;
}
