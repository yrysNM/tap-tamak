import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { DishesController } from './dishes.controller';
import { CrmDishesController } from './crm-dishes.controller';
import { DishesService } from './dishes.service';

@Module({
  imports: [PrismaModule],
  controllers: [DishesController, CrmDishesController],
  providers: [DishesService],
  exports: [DishesService],
})
export class DishesModule {}
