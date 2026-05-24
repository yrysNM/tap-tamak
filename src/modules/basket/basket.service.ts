import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

const basketCartInclude = {
  items: {
    include: {
      dish: {
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          imageUrl: true,
          isAvailable: true,
          portionCount: true,
          cookId: true,
          cook: {
            select: {
              id: true,
              profileImageUrl: true,
              businessName: true,
              rating: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.CartInclude;

type CartWithBasketItems = Prisma.CartGetPayload<{ include: typeof basketCartInclude }>;

@Injectable()
export class BasketService {
  constructor(private readonly prisma: PrismaService) {}

  private mapLineItem(item: CartWithBasketItems['items'][number]) {
    const { cook: _c, ...dish } = item.dish;
    return {
      id: item.id,
      dishId: item.dishId,
      quantity: item.quantity,
      lineSubtotal: item.quantity * item.dish.price,
      dish,
    };
  }

  private mapCookSummaryFromDishCook(
    cook: CartWithBasketItems['items'][number]['dish']['cook'],
  ) {
    return {
      id: cook.id,
      businessName: cook.businessName,
      rating: cook.rating,
      chefFirstName: cook.user.firstName,
      chefLastName: cook.user.lastName,
      chefAvatarUrl: cook.profileImageUrl,
    };
  }

  private buildCookGroups(cart: CartWithBasketItems) {
    const order: string[] = [];
    const byCookId = new Map<
      string,
      {
        cookId: string;
        cook: ReturnType<BasketService['mapCookSummaryFromDishCook']>;
        items: ReturnType<BasketService['mapLineItem']>[];
      }
    >();

    for (const item of cart.items) {
      const cookId = item.dish.cookId;
      if (!byCookId.has(cookId)) {
        order.push(cookId);
        byCookId.set(cookId, {
          cookId,
          cook: this.mapCookSummaryFromDishCook(item.dish.cook),
          items: [],
        });
      }
      byCookId.get(cookId)!.items.push(this.mapLineItem(item));
    }

    return order.map((cookId) => {
      const group = byCookId.get(cookId)!;
      const itemsCount = group.items.reduce((sum, row) => sum + row.quantity, 0);
      const itemsTotal = group.items.reduce((sum, row) => sum + row.lineSubtotal, 0);
      return { ...group, itemsCount, itemsTotal };
    });
  }

  private mapCartToResponse(cart: CartWithBasketItems | null) {
    if (!cart || cart.items.length === 0) {
      return {
        cookId: null as string | null,
        cook: null,
        groups: [] as Array<{
          cookId: string;
          cook: ReturnType<BasketService['mapCookSummaryFromDishCook']>;
          items: ReturnType<BasketService['mapLineItem']>[];
          itemsCount: number;
          itemsTotal: number;
        }>,
        items: [] as ReturnType<BasketService['mapLineItem']>[],
        itemsCount: 0,
        itemsTotal: 0,
      };
    }

    const groups = this.buildCookGroups(cart);
    const items = groups.flatMap((g) => g.items);
    const itemsTotal = items.reduce((sum, row) => sum + row.lineSubtotal, 0);
    const itemsCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    const singleGroup = groups.length === 1 ? groups[0] : null;

    return {
      cookId: singleGroup?.cookId ?? null,
      cook: singleGroup?.cook ?? null,
      groups,
      items,
      itemsCount,
      itemsTotal,
    };
  }

  private async loadCartForUser(userId: string): Promise<CartWithBasketItems | null> {
    return this.prisma.cart.findUnique({
      where: { userId },
      include: basketCartInclude,
    });
  }

  async getCart(userId: string) {
    const cart = await this.loadCartForUser(userId);
    return this.mapCartToResponse(cart);
  }

  async addItems(userId: string, items: Array<{ dishId: string; quantity: number }>) {
    if (!userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }

    const dishOrder: string[] = [];
    const sumByDish = new Map<string, number>();
    for (const { dishId, quantity } of items) {
      sumByDish.set(dishId, (sumByDish.get(dishId) ?? 0) + quantity);
      if (!dishOrder.includes(dishId)) {
        dishOrder.push(dishId);
      }
    }

    for (const dishId of dishOrder) {
      const total = sumByDish.get(dishId)!;
      if (total > 100) {
        throw new BadRequestException('Merged quantity per dish must not exceed 100');
      }
    }

    const dishes = await this.prisma.dish.findMany({
      where: { id: { in: dishOrder } },
      select: { id: true, cookId: true, isAvailable: true },
    });
    const foundIds = new Set(dishes.map((d) => d.id));
    for (const id of dishOrder) {
      if (!foundIds.has(id)) {
        throw new NotFoundException('Dish not found');
      }
    }

    const unavailable = dishes.find((d) => !d.isAvailable);
    if (unavailable) {
      throw new BadRequestException('Dish is not available');
    }

    const dishById = new Map(dishes.map((d) => [d.id, d]));

    return this.prisma.$transaction(async (tx) => {
      let cart = await tx.cart.upsert({
        where: { userId },
        update: {},
        create: { userId, cookId: null },
        select: { id: true },
      });

      for (const dishId of dishOrder) {
        const dish = dishById.get(dishId)!;

        const addQty = sumByDish.get(dishId)!;
        const existing = await tx.cartItem.findFirst({
          where: { cartId: cart.id, dishId: dish.id },
          select: { id: true, quantity: true },
        });

        if (existing) {
          await tx.cartItem.update({
            where: { id: existing.id },
            data: { quantity: existing.quantity + addQty },
          });
        } else {
          await tx.cartItem.create({
            data: { cartId: cart.id, dishId: dish.id, quantity: addQty },
          });
        }
      }

      const updated = await tx.cart.findUnique({
        where: { id: cart.id },
        include: basketCartInclude,
      });

      return this.mapCartToResponse(updated);
    });
  }

  async updateItemQuantity(userId: string, cartItemId: string, quantity: number) {
    if (quantity < 1) {
      return this.removeItem(userId, cartItemId);
    }

    const item = await this.prisma.cartItem.findFirst({
      where: { id: cartItemId, cart: { userId } },
      select: { id: true, cartId: true },
    });
    if (!item) {
      throw new NotFoundException('Basket item not found');
    }

    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity },
    });

    const cart = await this.loadCartForUser(userId);
    return this.mapCartToResponse(cart);
  }

  async removeItem(userId: string, cartItemId: string) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: cartItemId, cart: { userId } },
      select: { id: true, cartId: true },
    });
    if (!item) {
      throw new NotFoundException('Basket item not found');
    }

    await this.prisma.cartItem.delete({ where: { id: item.id } });

    const remaining = await this.prisma.cartItem.count({
      where: { cartId: item.cartId },
    });
    if (remaining === 0) {
      await this.prisma.cart.delete({ where: { id: item.cartId } });
      return this.mapCartToResponse(null);
    }

    const cart = await this.loadCartForUser(userId);
    return this.mapCartToResponse(cart);
  }

  async clearCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!cart) {
      return this.mapCartToResponse(null);
    }

    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await this.prisma.cart.delete({ where: { id: cart.id } });

    return this.mapCartToResponse(null);
  }
}
