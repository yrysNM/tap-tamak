import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCookLeadDto {
  @ApiProperty({ example: 'cook@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Ayan Nur' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName: string;

  @ApiProperty({
    example: 'I would like to join as a home cook in Almaty.',
    description: 'Free-text message or review from the Tilda form.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  message: string;
}
