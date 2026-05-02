import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { CrmMenusController } from './crm-menus.controller';
import { MenusController } from './menus.controller';
import { MenusService } from './menus.service';

@Module({
  imports: [PrismaModule],
  controllers: [MenusController, CrmMenusController],
  providers: [MenusService],
  exports: [MenusService],
})
export class MenusModule {}
