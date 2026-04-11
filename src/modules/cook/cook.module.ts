import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { CookVerificationService } from './cook-verification.service';
import { CookController } from './cook.controller';
import { CrmCookVerificationsController } from './crm-cook-verifications.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CookController, CrmCookVerificationsController],
  providers: [CookVerificationService],
  exports: [CookVerificationService],
})
export class CookModule {}
