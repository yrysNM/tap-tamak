import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { StatsService } from './stats.service';
import { CrmStatsController } from './crm-stats.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CrmStatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
