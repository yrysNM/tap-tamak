import { BadRequestException, Injectable } from '@nestjs/common';
import type { Express } from 'express';
import { StorageService } from '../../core/storage/storage.service';

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const MAX_BYTES = 8 * 1024 * 1024;

function extForImageMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    default:
      return '';
  }
}

export interface GalleryUploadResult {
  url: string;
  path: string;
}

export interface GalleryImageItem {
  path: string;
  url: string;
}

@Injectable()
export class GalleryService {
  constructor(private readonly storage: StorageService) {}

  async listImages(): Promise<GalleryImageItem[]> {
    return this.storage.listGalleryImages();
  }

  async uploadImage(file: Express.Multer.File | undefined): Promise<GalleryUploadResult> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Image file is required (field name: file)');
    }
    if (!IMAGE_MIMES.has(file.mimetype)) {
      throw new BadRequestException(
        `Image must be JPEG, PNG, or WebP (got ${file.mimetype})`,
      );
    }
    const ext = extForImageMime(file.mimetype);
    if (!ext) {
      throw new BadRequestException('Unsupported image type');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('Image must be at most 8MB');
    }
    const path = await this.storage.saveGalleryFile(file.buffer, ext);
    return {
      path,
      url: this.storage.getPublicUrl(path),
    };
  }
}
