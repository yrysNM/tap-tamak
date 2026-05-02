import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { paginationSkip } from '../../common/dto/pagination.dto';
import { CreateMenuDto } from './dto/create-menu.dto';
import { parseMenuDateUtc, utcTodayDateOnly } from './menu-date.util';
import { UpdateMenuDto } from './dto/update-menu.dto';

@Injectable()
export class MenusService {
  constructor(private readonly prisma: PrismaService) {}

  private async getCookForUser(userId: string) {
    let cook = await this.prisma.cook.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (cook) {
      return cook;
    }

    // Legacy users can have COOK role but no Cook row yet; create it lazily.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    cook = await this.prisma.cook.create({
      data: {
        userId,
        businessName: user.firstName.trim() || 'Cook',
      },
      select: { id: true },
    });
    if (!cook) {
      throw new NotFoundException('Cook profile not found');
    }
    return cook;
  }

  private menuInclude() {
    return {
      dishes: true,
      cook: { select: { id: true, businessName: true } },
    } as const;
  }

  async createForCook(userId: string, dto: CreateMenuDto) {
    const cook = await this.getCookForUser(userId);
    const uniqueDishIds = [...new Set(dto.dishIds)];
    const date = parseMenuDateUtc(dto.date);

    const count = await this.prisma.dish.count({
      where: { cookId: cook.id, id: { in: uniqueDishIds } },
    });
    if (count !== uniqueDishIds.length) {
      throw new BadRequestException(
        'One or more dishes are invalid or do not belong to your kitchen',
      );
    }

    try {
      return await this.prisma.menu.create({
        data: {
          cookId: cook.id,
          date,
          dishes: { connect: uniqueDishIds.map((id) => ({ id })) },
        },
        include: this.menuInclude(),
      });
    } catch (e) {
      if (
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException('Menu already exists for this date');
      }
      throw e;
    }
  }

  async getTodayForCook(userId: string) {
    const cook = await this.getCookForUser(userId);
    const date = utcTodayDateOnly();
    const menu = await this.prisma.menu.findUnique({
      where: {
        cookId_date: { cookId: cook.id, date },
      },
      include: this.menuInclude(),
    });
    return menu;
  }

  async getByDateForCook(userId: string, dateParam: string) {
    const cook = await this.getCookForUser(userId);
    const date = parseMenuDateUtc(dateParam);
    const menu = await this.prisma.menu.findUnique({
      where: {
        cookId_date: { cookId: cook.id, date },
      },
      include: this.menuInclude(),
    });
    if (!menu) {
      throw new NotFoundException('Menu not found for this date');
    }
    return menu;
  }

  async getByIdForCook(userId: string, menuId: string) {
    const cook = await this.getCookForUser(userId);
    const menu = await this.prisma.menu.findFirst({
      where: { id: menuId, cookId: cook.id },
      include: this.menuInclude(),
    });
    if (!menu) {
      throw new NotFoundException('Menu not found');
    }
    return menu;
  }

  async updateForCook(userId: string, menuId: string, dto: UpdateMenuDto) {
    const cook = await this.getCookForUser(userId);
    const existing = await this.prisma.menu.findFirst({
      where: { id: menuId, cookId: cook.id },
    });
    if (!existing) {
      throw new NotFoundException('Menu not found');
    }

    const data: Prisma.MenuUpdateInput = {};

    if (dto.date) {
      data.date = parseMenuDateUtc(dto.date);
    }

    if (dto.dishIds) {
      const uniqueDishIds = [...new Set(dto.dishIds)];
      const count = await this.prisma.dish.count({
        where: { cookId: cook.id, id: { in: uniqueDishIds } },
      });
      if (count !== uniqueDishIds.length) {
        throw new BadRequestException(
          'One or more dishes are invalid or do not belong to your kitchen',
        );
      }
      data.dishes = { set: uniqueDishIds.map((id) => ({ id })) };
    }

    try {
      return await this.prisma.menu.update({
        where: { id: existing.id },
        data,
        include: this.menuInclude(),
      });
    } catch (e) {
      if (
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException('Menu already exists for this date');
      }
      throw e;
    }
  }

  async deleteForCook(userId: string, menuId: string) {
    const cook = await this.getCookForUser(userId);
    const existing = await this.prisma.menu.findFirst({
      where: { id: menuId, cookId: cook.id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Menu not found');
    }

    await this.prisma.menu.delete({ where: { id: existing.id } });
    return { success: true };
  }

  async listHistoryForCook(
    userId: string,
    params: {
      from: string;
      to: string;
      page: number;
      limit: number;
    },
  ) {
    const cook = await this.getCookForUser(userId);
    const from = parseMenuDateUtc(params.from);
    const to = parseMenuDateUtc(params.to);
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('`from` must be on or before `to`');
    }

    const where: Prisma.MenuWhereInput = {
      cookId: cook.id,
      date: { gte: from, lte: to },
    };

    const skip = paginationSkip(params.page, params.limit);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.menu.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: params.limit,
        include: this.menuInclude(),
      }),
      this.prisma.menu.count({ where }),
    ]);

    return { items, meta: { total, page: params.page, limit: params.limit } };
  }

  async listForCrm(params: {
    page: number;
    limit: number;
    cookId?: string;
    from?: string;
    to?: string;
  }) {
    const where: Prisma.MenuWhereInput = {};
    if (params.cookId) {
      where.cookId = params.cookId;
    }
    if (params.from || params.to) {
      const range: Prisma.DateTimeFilter = {};
      const fromD = params.from ? parseMenuDateUtc(params.from) : undefined;
      const toD = params.to ? parseMenuDateUtc(params.to) : undefined;
      if (fromD) {
        range.gte = fromD;
      }
      if (toD) {
        range.lte = toD;
      }
      if (fromD && toD && fromD.getTime() > toD.getTime()) {
        throw new BadRequestException('`from` must be on or before `to`');
      }
      where.date = range;
    }

    const skip = paginationSkip(params.page, params.limit);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.menu.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: params.limit,
        include: this.menuInclude(),
      }),
      this.prisma.menu.count({ where }),
    ]);

    return { items, meta: { total, page: params.page, limit: params.limit } };
  }
}
