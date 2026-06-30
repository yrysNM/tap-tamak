import { Module } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { ModerationController } from './moderation.controller';
import { CrmModerationController } from './crm-moderation.controller';

@Module({
  controllers: [ModerationController, CrmModerationController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
