import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Express } from 'express';
import { DishPreparationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { StorageService } from '../../core/storage/storage.service';
import { CreateDishFormDto } from './dto/create-dish-form.dto';
import { paginationSkip } from '../../common/dto/pagination.dto';
import { UpdateDishFormDto } from './dto/update-dish-form.dto';
import { isCookActiveNow } from '../cook/cook-availability.util';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

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

function parseTags(raw: string | undefined): string[] {
  if (raw == null || !raw.trim()) {
    return [];
  }
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

@Injectable()
export class DishesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private async getCookForUser(userId: string) {
    const cook = await this.prisma.cook.findUnique({ where: { userId } });
    if (!cook) {
      throw new NotFoundException('Cook profile not found');
    }
    return cook;
  }

  private async isCookScheduleActive(cookId: string): Promise<boolean> {
    const cook = await this.prisma.cook.findUnique({
      where: { id: cookId },
      select: {
        verificationStatus: true,
        isAvailable: true,
        workStartAt: true,
        workEndAt: true,
      },
    });
    if (!cook) {
      return false;
    }
    return isCookActiveNow(cook);
  }

  private relativePathFromPublicUrl(imageUrl: string | null | undefined): string | null {
    if (!imageUrl) return null;
    const prefix = '/api/v1/uploads/';
    if (!imageUrl.startsWith(prefix)) return null;
    return imageUrl.slice(prefix.length);
  }

  async createForCook(
    userId: string,
    dto: CreateDishFormDto,
    image: Express.Multer.File | undefined,
  ) {
    if (!image?.buffer?.length) {
      throw new BadRequestException(
        'Image file is required (multipart field name: image)',
      );
    }
    if (!IMAGE_MIMES.has(image.mimetype)) {
      throw new BadRequestException(
        `Image must be JPEG, PNG, or WebP (got ${image.mimetype})`,
      );
    }
    const ext = extForImageMime(image.mimetype);
    if (!ext) {
      throw new BadRequestException('Unsupported image type');
    }
    if (image.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Image must be at most 8MB');
    }

    const cook = await this.getCookForUser(userId);
    const relativePath = await this.storage.saveDishImage(
      cook.id,
      image.buffer,
      ext,
    );
    const imageUrl = this.storage.getPublicUrl(relativePath);

    const category = dto.category?.trim() || 'general';
    const tags = parseTags(dto.tags);

    return this.prisma.dish.create({
      data: {
        cookId: cook.id,
        name: dto.name.trim(),
        description: dto.description.trim(),
        cookingTime: dto.cookingTime,
        preparationType: dto.preparationType,
        price: dto.price,
        category,
        tags,
        calories: dto.calories ?? null,
        portionCount: dto.portionCount ?? undefined,
        isAvailable: dto.isAvailable ?? true,
        imageUrl,
      } as Prisma.DishUncheckedCreateInput,
    });
  }

  async listForCook(userId: string, page = 1, limit = 20) {
    const cook = await this.getCookForUser(userId);
    const cookActiveNow = await this.isCookScheduleActive(cook.id);
    const where: Prisma.DishWhereInput = { cookId: cook.id };
    const skip = paginationSkip(page, limit);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.dish.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.dish.count({ where }),
    ]);

    return {
      items: items.map((dish) => ({
        ...dish,
        isAvailable: dish.isAvailable && cookActiveNow,
      })),
      meta: { total, page, limit },
    };
  }

  async getOneForCook(userId: string, dishId: string) {
    const cook = await this.getCookForUser(userId);
    const cookActiveNow = await this.isCookScheduleActive(cook.id);
    const dish = await this.prisma.dish.findFirst({
      where: { id: dishId, cookId: cook.id },
    });
    if (!dish) {
      throw new NotFoundException('Dish not found');
    }
    return {
      ...dish,
      isAvailable: dish.isAvailable && cookActiveNow,
    };
  }

  async updateForCook(
    userId: string,
    dishId: string,
    dto: UpdateDishFormDto,
    image: Express.Multer.File | undefined,
  ) {
    const cook = await this.getCookForUser(userId);
    const existing = await this.prisma.dish.findFirst({
      where: { id: dishId, cookId: cook.id },
    });
    if (!existing) {
      throw new NotFoundException('Dish not found');
    }

    const data: Prisma.DishUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.cookingTime !== undefined) data.cookingTime = dto.cookingTime;
    if (dto.preparationType !== undefined) data.preparationType = dto.preparationType;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.category !== undefined) data.category = dto.category.trim() || 'general';
    if (dto.tags !== undefined) data.tags = parseTags(dto.tags);
    if (dto.calories !== undefined) data.calories = dto.calories;
    if (dto.portionCount !== undefined) {
      Object.assign(data, { portionCount: dto.portionCount } as Prisma.DishUpdateInput);
    }
    if (dto.isAvailable !== undefined) data.isAvailable = dto.isAvailable;

    const oldImageRelative = this.relativePathFromPublicUrl(existing.imageUrl);
    let newImageRelative: string | null = null;
    if (image) {
      if (!image.buffer?.length) {
        throw new BadRequestException(
          'Image file is invalid (multipart field name: image)',
        );
      }
      if (!IMAGE_MIMES.has(image.mimetype)) {
        throw new BadRequestException(
          `Image must be JPEG, PNG, or WebP (got ${image.mimetype})`,
        );
      }
      const ext = extForImageMime(image.mimetype);
      if (!ext) {
        throw new BadRequestException('Unsupported image type');
      }
      if (image.size > MAX_IMAGE_BYTES) {
        throw new BadRequestException('Image must be at most 8MB');
      }

      newImageRelative = await this.storage.saveDishImage(cook.id, image.buffer, ext);
      data.imageUrl = this.storage.getPublicUrl(newImageRelative);
    }

    const updated = await this.prisma.dish.update({
      where: { id: existing.id },
      data,
    });

    if (newImageRelative && oldImageRelative) {
      await this.storage.removeStoredFiles([oldImageRelative]);
    }

    return updated;
  }

  async deleteForCook(userId: string, dishId: string) {
    const cook = await this.getCookForUser(userId);
    const existing = await this.prisma.dish.findFirst({
      where: { id: dishId, cookId: cook.id },
    });
    if (!existing) {
      throw new NotFoundException('Dish not found');
    }

    const imageRelative = this.relativePathFromPublicUrl(existing.imageUrl);
    await this.prisma.dish.delete({ where: { id: existing.id } });
    if (imageRelative) {
      await this.storage.removeStoredFiles([imageRelative]);
    }
    return { success: true };
  }

  async listForCrm(params: {
    page: number;
    limit: number;
    cookId?: string;
    preparationType?: DishPreparationType;
    name?: string;
  }) {
    const where: Prisma.DishWhereInput = {};
    if (params.cookId) {
      where.cookId = params.cookId;
    }
    if (params.preparationType) {
      where.preparationType = params.preparationType;
    }
    if (params.name?.trim()) {
      where.name = {
        contains: params.name.trim(),
        mode: 'insensitive',
      };
    }

    const skip = paginationSkip(params.page, params.limit);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.dish.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
        include: { cook: { select: { id: true, businessName: true } } },
      }),
      this.prisma.dish.count({ where }),
    ]);

    return { items, meta: { total, page: params.page, limit: params.limit } };
  }
}
