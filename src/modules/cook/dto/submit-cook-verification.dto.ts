import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';

export class SubmitCookVerificationDto {
  @ApiProperty({
    example: 43.238949,
    description: 'Cook location latitude in decimal degrees',
  })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({
    example: 76.889709,
    description: 'Cook location longitude in decimal degrees',
  })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;
}
