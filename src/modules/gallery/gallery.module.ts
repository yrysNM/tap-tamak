import { Module } from '@nestjs/common';
import { CrmGalleryController } from './crm-gallery.controller';
import { GalleryService } from './gallery.service';

@Module({
  controllers: [CrmGalleryController],
  providers: [GalleryService],
})
export class GalleryModule {}
