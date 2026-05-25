import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { StatsModule } from '../stats/stats.module';
import { CookVerificationService } from './cook-verification.service';
import { CookService } from './cook.service';
import { CookController } from './cook.controller';
import { CrmCookVerificationsController } from './crm-cook-verifications.controller';

@Module({
  imports: [PrismaModule, StatsModule],
  controllers: [CookController, CrmCookVerificationsController],
  providers: [CookVerificationService, CookService],
  exports: [CookVerificationService, CookService],
})
export class CookModule {}
