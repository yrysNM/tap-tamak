import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { CrmOrdersController } from './crm-orders.controller';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [OrderService],
  controllers: [OrderController, CrmOrdersController],
  exports: [OrderService],
})
export class OrderModule {}
 
