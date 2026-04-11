import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { OrderStatus, PaymentStatus, Role } from '@prisma/client';

interface CreateOrderResult {
  orderId: string;
}

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService) {}

  async createFromCart(userId: string): Promise<CreateOrderResult> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: { items: { include: { dish: true } } },
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const cookId = cart.cookId ?? cart.items[0].dish.cookId;
    const dishes = cart.items.map((item) => item.dish);

    // Validate all dishes belong to same cook and are available
    const uniqueCookIds = new Set(dishes.map((d) => d.cookId));
    if (uniqueCookIds.size > 1) {
      throw new BadRequestException('Cart must contain dishes from a single cook');
    }

    if (dishes.some((d) => !d.isAvailable)) {
      throw new BadRequestException('Some dishes are not available');
    }

    const itemsTotal = cart.items.reduce((sum, item) => sum + item.quantity * item.dish.price, 0);

    const platformFeePercent = Number(process.env.PLATFORM_FEE_PERCENT ?? 0);
    const platformFee = Math.floor((itemsTotal * platformFeePercent) / 100);

    const deliveryFee = 0; // placeholder, could be calculated based on distance later
    const totalAmount = itemsTotal + deliveryFee;

    const orderNumber = `ORD-${Date.now()}`;

    const deliveryAddress = await this.prisma.address.findFirst({
      where: { userId, isDefault: true },
    });

    if (!deliveryAddress) {
      throw new BadRequestException('Default delivery address not set');
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          userId,
          cookId,
          status: OrderStatus.PENDING,
          totalAmount,
          deliveryFee,
          deliveryAddress: `${deliveryAddress.street}, ${deliveryAddress.city}`,
          paymentStatus: PaymentStatus.PENDING,
        },
      });

      await tx.orderItem.createMany({
        data: cart.items.map((item) => ({
          orderId: createdOrder.id,
          dishId: item.dishId,
          quantity: item.quantity,
          price: item.dish.price,
          name: item.dish.name,
        })),
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.delete({ where: { id: cart.id } });

      return createdOrder;
    });

    return { orderId: order.id };
  }

  async listForUser(userId: string, page = 1, limit = 20, status?: OrderStatus) {
    const where: any = { userId };
    if (status) {
      where.status = status;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { items: true, cook: true },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
      },
    };
  }

  async listForCook(cookId: string, page = 1, limit = 20, status?: OrderStatus) {
    const where: any = { cookId };
    if (status) {
      where.status = status;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { items: true, user: true },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
      },
    };
  }

  async getOrderById(orderId: string, userId: string, role: Role, cookId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, user: true, cook: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (role === Role.USER && order.userId !== userId) {
      throw new ForbiddenException();
    }

    if (role === Role.COOK && cookId && order.cookId !== cookId) {
      throw new ForbiddenException();
    }

    return order;
  }

  async updateStatus(orderId: string, cookId: string, nextStatus: OrderStatus) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.cookId !== cookId) {
      throw new ForbiddenException();
    }

    const validNextStatuses: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.CONFIRMED],
      [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING],
      [OrderStatus.PREPARING]: [OrderStatus.READY],
      [OrderStatus.READY]: [OrderStatus.ON_THE_WAY],
      [OrderStatus.ON_THE_WAY]: [OrderStatus.DELIVERED],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.CANCELLED]: [],
    };

    if (!validNextStatuses[order.status].includes(nextStatus)) {
      throw new BadRequestException('Invalid status transition');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: nextStatus },
    });

    return updated;
  }

  async cancel(orderId: string, userId: string, role: Role, cookId?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (role === Role.USER) {
      if (order.userId !== userId) {
        throw new ForbiddenException();
      }
      if (
        order.status !== OrderStatus.PENDING &&
        order.status !== OrderStatus.CONFIRMED
      ) {
        throw new BadRequestException('Cannot cancel after preparation has started');
      }
    }

    if (role === Role.COOK) {
      if (!cookId || order.cookId !== cookId) {
        throw new ForbiddenException();
      }
      if (order.status === OrderStatus.DELIVERED) {
        throw new BadRequestException('Cannot cancel delivered order');
      }
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });

    return updated;
  }
}

