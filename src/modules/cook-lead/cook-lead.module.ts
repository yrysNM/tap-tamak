import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { CookLeadService } from './cook-lead.service';
import { TildaWebhookController } from './tilda-webhook.controller';
import { CrmCookLeadsController } from './crm-cook-leads.controller';
import { TildaWebhookSecretGuard } from './guards/tilda-webhook-secret.guard';

@Module({
  imports: [PrismaModule],
  providers: [CookLeadService, TildaWebhookSecretGuard],
  controllers: [TildaWebhookController, CrmCookLeadsController],
  exports: [CookLeadService],
})
export class CookLeadModule {}
