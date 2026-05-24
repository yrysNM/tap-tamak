import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentProvider, PaymentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class AdminSetPaymentStatusDto {
  @ApiProperty({ enum: PaymentStatus })
  @IsEnum(PaymentStatus)
  paymentStatus!: PaymentStatus;

  @ApiPropertyOptional({ enum: PaymentProvider, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(PaymentProvider)
  paymentProvider?: PaymentProvider | null;

  @ApiPropertyOptional({ description: 'External payment reference from the provider' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentId?: string;
}
