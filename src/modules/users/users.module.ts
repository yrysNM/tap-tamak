import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { UsersService } from './users.service';
import { CrmUsersController } from './crm-users.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CrmUsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
