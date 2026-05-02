import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class BasketService {
  constructor(private readonly prisma: PrismaService) {}

  private ensureCookConstraintOrThrow(currentCookId: string | null, nextCookId: string) {
    if (currentCookId && currentCookId !== nextCookId) {
      throw new BadRequestException('Basket must contain dishes from a single cook');
    }
  }

  async addItem(userId: string, dishId: string, quantity: number) {
    const dish = await this.prisma.dish.findUnique({
      where: { id: dishId },
      select: { id: true, cookId: true, isAvailable: true },
    });
    if (!dish) {
      throw new NotFoundException('Dish not found');
    }
    if (!dish.isAvailable) {
      throw new BadRequestException('Dish is not available');
    }

    const cart = await this.prisma.cart.upsert({
      where: { userId },
      update: {},
      create: { userId, cookId: dish.cookId },
      select: { id: true, cookId: true },
    });
    this.ensureCookConstraintOrThrow(cart.cookId, dish.cookId);

    if (cart.cookId !== dish.cookId) {
      await this.prisma.cart.update({
        where: { id: cart.id },
        data: { cookId: dish.cookId },
      });
    }

    const existing = await this.prisma.cartItem.findFirst({
      where: { cartId: cart.id, dishId: dish.id },
      select: { id: true, quantity: true },
    });

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + quantity },
      });
    } else {
      await this.prisma.cartItem.create({
        data: { cartId: cart.id, dishId: dish.id, quantity },
      });
    }

    const updated = await this.prisma.cart.findUnique({
      where: { id: cart.id },
      include: {
        items: {
          include: {
            dish: {
              select: {
                id: true,
                name: true,
                price: true,
                imageUrl: true,
                isAvailable: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return {
      cookId: updated?.cookId ?? null,
      items:
        updated?.items.map((item) => ({
          id: item.id,
          dishId: item.dishId,
          quantity: item.quantity,
          dish: item.dish,
        })) ?? [],
      itemsCount:
        updated?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
    };
  }
}
