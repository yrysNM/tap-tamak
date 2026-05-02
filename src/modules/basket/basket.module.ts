import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { BasketController } from './basket.controller';
import { BasketService } from './basket.service';

@Module({
  imports: [PrismaModule],
  controllers: [BasketController],
  providers: [BasketService],
  exports: [BasketService],
})
export class BasketModule {}
