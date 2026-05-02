import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { StorageService } from '../../core/storage/storage.service';
import { paginationSkip } from '../../common/dto/pagination.dto';
import { isCookActiveNow } from './cook-availability.util';
import { parseMenuDateUtc, utcTodayDateOnly } from '../menus/menu-date.util';

const publicCookSelect = {
  id: true,
  businessName: true,
  bio: true,
  rating: true,
  totalReviews: true,
  latitude: true,
  longitude: true,
  isAvailable: true,
  workStartAt: true,
  workEndAt: true,
  verification: {
    select: {
      kitchenPhotoUrls: true,
    },
  },
} satisfies Prisma.CookSelect;

type PublicCookRow = Prisma.CookGetPayload<{
  select: typeof publicCookSelect;
}>;

export type PublicCookSummary = Omit<PublicCookRow, 'verification'> & {
  kitchenPhotoUrls: string[];
};

@Injectable()
export class CookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private parseScheduleRangeOrThrow(workStartAt: string, workEndAt: string) {
    const start = new Date(workStartAt);
    const end = new Date(workEndAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid schedule datetime');
    }
    if (start >= end) {
      throw new BadRequestException('`workStartAt` must be before `workEndAt`');
    }
    return { start, end };
  }

  async getMySchedule(userId: string) {
    const cook = await this.prisma.cook.findUnique({
      where: { userId },
      select: {
        id: true,
        workStartAt: true,
        workEndAt: true,
        isAvailable: true,
        verificationStatus: true,
      },
    });
    if (!cook) {
      throw new NotFoundException('Cook profile not found');
    }
    const activeNow = isCookActiveNow(cook);
    return {
      workStartAt: cook.workStartAt,
      workEndAt: cook.workEndAt,
      isActiveNow: activeNow,
    };
  }

  async updateMySchedule(userId: string, workStartAt: string, workEndAt: string) {
    const { start, end } = this.parseScheduleRangeOrThrow(workStartAt, workEndAt);
    const cook = await this.prisma.cook.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!cook) {
      throw new NotFoundException('Cook profile not found');
    }
    const updated = await this.prisma.cook.update({
      where: { id: cook.id },
      data: { workStartAt: start, workEndAt: end },
      select: {
        workStartAt: true,
        workEndAt: true,
        isAvailable: true,
        verificationStatus: true,
      },
    });
    return {
      workStartAt: updated.workStartAt,
      workEndAt: updated.workEndAt,
      isActiveNow: isCookActiveNow(updated),
    };
  }

  async listForClient(params: {
    page: number;
    limit: number;
    isAvailable?: boolean;
    q?: string;
  }): Promise<{ items: PublicCookSummary[]; meta: { total: number; page: number; limit: number } }> {
    const now = new Date();
    const where: Prisma.CookWhereInput = {
      verificationStatus: VerificationStatus.APPROVED,
    };
    if (params.isAvailable !== undefined) {
      if (params.isAvailable) {
        where.AND = [
          { isAvailable: true },
          { workStartAt: { not: null, lte: now } },
          { workEndAt: { not: null, gt: now } },
        ];
      } else {
        where.OR = [
          { isAvailable: false },
          { workStartAt: null },
          { workEndAt: null },
          { workStartAt: { gt: now } },
          { workEndAt: { lte: now } },
        ];
      }
    }
    if (params.q?.trim()) {
      where.businessName = {
        contains: params.q.trim(),
        mode: 'insensitive',
      };
    }

    const skip = paginationSkip(params.page, params.limit);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.cook.findMany({
        where,
        select: publicCookSelect,
        orderBy: [{ rating: 'desc' }, { businessName: 'asc' }],
        skip,
        take: params.limit,
      }),
      this.prisma.cook.count({ where }),
    ]);

    return {
      items: items.map((cook) => {
        const { verification, ...rest } = cook;
        return {
          ...rest,
          kitchenPhotoUrls: verification
            ? verification.kitchenPhotoUrls.map((path) =>
                this.storage.getPublicUrl(path),
              )
            : [],
          isAvailable: isCookActiveNow(
            {
              ...cook,
              verificationStatus: VerificationStatus.APPROVED,
            },
            now,
          ),
        };
      }),
      meta: { total, page: params.page, limit: params.limit },
    };
  }

  async getMenuInformationForClient(cookId: string, dateParam?: string) {
    const date = dateParam ? parseMenuDateUtc(dateParam) : utcTodayDateOnly();
    const cook = await this.prisma.cook.findUnique({
      where: { id: cookId },
      select: {
        id: true,
        businessName: true,
        bio: true,
        rating: true,
        totalReviews: true,
        latitude: true,
        longitude: true,
        isAvailable: true,
        workStartAt: true,
        workEndAt: true,
        verificationStatus: true,
        verification: {
          select: {
            kitchenPhotoUrls: true,
          },
        },
      },
    });
    if (!cook || cook.verificationStatus !== VerificationStatus.APPROVED) {
      throw new NotFoundException('Cook not found');
    }

    const menu = await this.prisma.menu.findUnique({
      where: { cookId_date: { cookId, date } },
      include: {
        dishes: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            imageUrl: true,
            isAvailable: true,
            cookingTime: true,
            preparationType: true,
          },
        },
      },
    });

    const now = new Date();
    return {
      cook: {
        id: cook.id,
        businessName: cook.businessName,
        bio: cook.bio,
        rating: cook.rating,
        totalReviews: cook.totalReviews,
        latitude: cook.latitude,
        longitude: cook.longitude,
        isAvailable: isCookActiveNow(cook, now),
        kitchenPhotoUrls: cook.verification?.kitchenPhotoUrls.map((path) =>
          this.storage.getPublicUrl(path),
        ) ?? [],
      },
      menu: menu
        ? {
            id: menu.id,
            date: menu.date,
          }
        : null,
      dishes: (menu?.dishes ?? []).map((dish) => ({
        ...dish,
        isAvailable: dish.isAvailable && isCookActiveNow(cook, now),
      })),
    };
  }
}
