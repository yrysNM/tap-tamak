import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
  Role,
  NotificationType,
} from '@prisma/client';
import type { Express } from 'express';
import { PrismaService } from '../../core/database/prisma.service';
import { StorageService } from '../../core/storage/storage.service';
import { isCookActiveNow } from '../cook/cook-availability.util';
import { CheckoutOrderDto } from './dto/checkout-order.dto';
import { CheckoutMultipartFormDto } from './dto/checkout-multipart-form.dto';
import { AdminPatchOrderDto } from './dto/admin-patch-order.dto';

interface CreateOrderResult {
  orderId: string;
}

const cartForCheckoutInclude = Prisma.validator<Prisma.CartInclude>()({
  items: { include: { dish: true } },
});

type CartForCheckout = Prisma.CartGetPayload<{ include: typeof cartForCheckoutInclude }>;

interface CheckoutPricing {
  itemsTotal: number;
  platformFeePercent: number;
  platformFee: number;
  deliveryFee: number;
  discountAmount: number;
  totalAmount: number;
}

const COOK_HIDDEN_STATUSES: OrderStatus[] = [OrderStatus.AWAITING_PAYMENT];

const CHECKOUT_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_CHECKOUT_PHOTO_BYTES = 8 * 1024 * 1024;

const adminOrderInclude = Prisma.validator<Prisma.OrderInclude>()({
  items: { include: { dish: true } },
  user: true,
  cook: { include: { user: { select: { firstName: true, lastName: true, phone: true } } } },
});

type OrderWithAdminInclude = Prisma.OrderGetPayload<{ include: typeof adminOrderInclude }>;

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private extForCheckoutImageMime(mime: string): string {
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

  private assertValidCheckoutPhoto(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Photo is required (multipart field name: photo)');
    }
    if (!CHECKOUT_IMAGE_MIMES.has(file.mimetype)) {
      throw new BadRequestException(`Photo must be JPEG, PNG, or WebP (got ${file.mimetype})`);
    }
    if (!this.extForCheckoutImageMime(file.mimetype)) {
      throw new BadRequestException('Unsupported image type');
    }
    if (file.size > MAX_CHECKOUT_PHOTO_BYTES) {
      throw new BadRequestException('Photo must be at most 8MB');
    }
  }

  private multipartFormToCheckoutDto(form: CheckoutMultipartFormDto): CheckoutOrderDto {
    return {
      addressLine: form.addressLine,
      city: form.city,
      entrance: form.entrance,
      intercom: form.intercom,
      floor: form.floor,
      apartment: form.apartment,
      contactPhone: form.contactPhone,
      saveAddress: form.saveAddress ?? false,
      savedAddressLabel: form.savedAddressLabel,
      discountAmount: form.discountAmount ?? 0,
    };
  }

  private computePricing(cart: CartForCheckout, _discountAmountInput: number): CheckoutPricing {
    const itemsTotal = cart.items.reduce((sum, item) => sum + item.quantity * item.dish.price, 0);
    const platformFeePercent = Number(process.env.PLATFORM_FEE_PERCENT ?? 0);
    const platformFee = Math.floor((itemsTotal * platformFeePercent) / 100);
    // Enforce server-side dish-only pricing for final order amount.
    // Delivery and discount remain present in the response shape for compatibility.
    const deliveryFee = 0;
    const discountAmount = 0;
    const totalAmount = itemsTotal;
    return {
      itemsTotal,
      platformFeePercent,
      platformFee,
      deliveryFee,
      discountAmount,
      totalAmount,
    };
  }

  private async resolveCheckout(userId: string, dto: CheckoutOrderDto) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: cartForCheckoutInclude,
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const dishes = cart.items.map((item) => item.dish);
    const uniqueCookIds = new Set(dishes.map((d) => d.cookId));
    if (uniqueCookIds.size > 1) {
      throw new BadRequestException('Cart must contain dishes from a single cook');
    }

    if (dishes.some((d) => !d.isAvailable)) {
      throw new BadRequestException('Some dishes are not available');
    }

    const cookId = cart.cookId ?? cart.items[0].dish.cookId;

    const cook = await this.prisma.cook.findUnique({
      where: { id: cookId },
      select: {
        id: true,
        businessName: true,
        rating: true,
        verificationStatus: true,
        isAvailable: true,
        workStartAt: true,
        workEndAt: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (!cook) {
      throw new NotFoundException('Cook not found');
    }
    if (!isCookActiveNow(cook)) {
      throw new BadRequestException('Cook is not active at this time');
    }

    const pricing = this.computePricing(cart, dto.discountAmount ?? 0);

    return {
      cart,
      cookId,
      cook: {
        id: cook.id,
        businessName: cook.businessName,
        rating: cook.rating,
        chefFirstName: cook.user.firstName,
        chefLastName: cook.user.lastName,
      },
      dto,
      pricing,
    };
  }

  async prepareFromCart(userId: string, dto: CheckoutOrderDto) {
    const ctx = await this.resolveCheckout(userId, dto);
    const { cart, cook, dto: checkout, pricing } = ctx;

    return {
      basketId: cart.id,
      cook,
      delivery: {
        addressLine: checkout.addressLine,
        city: checkout.city,
        entrance: checkout.entrance,
        intercom: checkout.intercom,
        floor: checkout.floor,
        apartment: checkout.apartment,
        contactPhone: checkout.contactPhone,
        courierComment: checkout.courierComment,
        saveAddress: checkout.saveAddress ?? false,
      },
      items: cart.items.map((item) => ({
        dishId: item.dishId,
        name: item.dish.name,
        quantity: item.quantity,
        unitPrice: item.dish.price,
        lineSubtotal: item.quantity * item.dish.price,
      })),
      itemsTotal: pricing.itemsTotal,
      platformFeePercent: pricing.platformFeePercent,
      platformFee: pricing.platformFee,
      deliveryFee: pricing.deliveryFee,
      discountAmount: pricing.discountAmount,
      totalAmount: pricing.totalAmount,
    };
  }

  async createFromCart(userId: string, dto: CheckoutOrderDto): Promise<CreateOrderResult> {
    const ctx = await this.resolveCheckout(userId, dto);
    const { cart, cookId, pricing } = ctx;
    const checkout = dto;

    const orderNumber = `ORD-${Date.now()}`;

    const order = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          userId,
          cookId,
          basketId: cart.id,
          status: OrderStatus.AWAITING_COOK_ACCEPTANCE,
          totalAmount: pricing.totalAmount,
          deliveryFee: pricing.deliveryFee,
          discountAmount: pricing.discountAmount,
          deliveryAddress: checkout.addressLine.trim(),
          entrance: checkout.entrance?.trim() || null,
          intercom: checkout.intercom?.trim() || null,
          floor: checkout.floor?.trim() || null,
          apartment: checkout.apartment?.trim() || null,
          courierComment: checkout.courierComment?.trim() || null,
          contactPhone: checkout.contactPhone.trim(),
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

      if (checkout.saveAddress === true && checkout.city && checkout.savedAddressLabel) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
        await tx.address.create({
          data: {
            userId,
            label: checkout.savedAddressLabel.trim(),
            street: checkout.addressLine.trim(),
            city: checkout.city.trim(),
            entrance: checkout.entrance?.trim() || null,
            intercom: checkout.intercom?.trim() || null,
            floor: checkout.floor?.trim() || null,
            apartment: checkout.apartment?.trim() || null,
            contactPhone: checkout.contactPhone.trim(),
            isDefault: true,
          },
        });
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.delete({ where: { id: cart.id } });

      return createdOrder;
    });

    return { orderId: order.id };
  }

  async createFromCartMultipart(
    userId: string,
    form: CheckoutMultipartFormDto,
    photo: Express.Multer.File | undefined,
  ): Promise<CreateOrderResult> {
    this.assertValidCheckoutPhoto(photo);
    const checkout = this.multipartFormToCheckoutDto(form);
    const ctx = await this.resolveCheckout(userId, checkout);
    const { cart, cookId, pricing } = ctx;

    const ext = this.extForCheckoutImageMime(photo.mimetype);
    const checkoutPhotoPath = await this.storage.saveOrderCheckoutPhoto(userId, photo.buffer, ext);

    const orderNumber = `ORD-${Date.now()}`;

    const order = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          userId,
          cookId,
          basketId: cart.id,
          status: OrderStatus.AWAITING_COOK_ACCEPTANCE,
          totalAmount: pricing.totalAmount,
          deliveryFee: pricing.deliveryFee,
          discountAmount: pricing.discountAmount,
          deliveryAddress: checkout.addressLine.trim(),
          entrance: checkout.entrance?.trim() || null,
          intercom: checkout.intercom?.trim() || null,
          floor: checkout.floor?.trim() || null,
          apartment: checkout.apartment?.trim() || null,
          courierComment: null,
          contactPhone: checkout.contactPhone.trim(),
          checkoutPhotoPath,
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

      if (checkout.saveAddress === true && checkout.city && checkout.savedAddressLabel) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
        await tx.address.create({
          data: {
            userId,
            label: checkout.savedAddressLabel.trim(),
            street: checkout.addressLine.trim(),
            city: checkout.city.trim(),
            entrance: checkout.entrance?.trim() || null,
            intercom: checkout.intercom?.trim() || null,
            floor: checkout.floor?.trim() || null,
            apartment: checkout.apartment?.trim() || null,
            contactPhone: checkout.contactPhone.trim(),
            isDefault: true,
          },
        });
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.delete({ where: { id: cart.id } });

      return createdOrder;
    });

    return { orderId: order.id };
  }

  async acceptCookOrder(
    orderId: string,
    cookId: string,
    preparationTimeMinutes: number,
  ): Promise<{ preparationTimeMinutes: number; order: OrderWithAdminInclude }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.cookId !== cookId) {
      throw new ForbiddenException();
    }
    if (order.status !== OrderStatus.AWAITING_COOK_ACCEPTANCE) {
      throw new BadRequestException('Order is not awaiting cook acceptance');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.COOKING,
          preparationTimeMinutes,
        },
      });
      await tx.notification.create({
        data: {
          userId: order.userId,
          type: NotificationType.ORDER_UPDATE,
          title: 'Повар принял заказ',
          body: `Готовим заказ. Ориентировочное время: ${preparationTimeMinutes} мин.`,
          data: { orderId, preparationTimeMinutes },
        },
      });
    });

    const full = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: adminOrderInclude,
    });
    return { preparationTimeMinutes, order: full };
  }

  async rejectCookOrder(orderId: string, cookId: string, reason: string): Promise<OrderWithAdminInclude> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.cookId !== cookId) {
      throw new ForbiddenException();
    }
    if (order.status !== OrderStatus.AWAITING_COOK_ACCEPTANCE) {
      throw new BadRequestException('Order is not awaiting cook acceptance');
    }

    const trimmed = reason.trim();

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          rejectionReason: trimmed,
        },
      });
      await tx.notification.create({
        data: {
          userId: order.userId,
          type: NotificationType.ORDER_UPDATE,
          title: 'Заказ отклонён поваром',
          body: trimmed,
          data: { orderId },
        },
      });
    });

    return this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: adminOrderInclude,
    });
  }

  async acceptDeliveredOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { cook: { select: { userId: true } } },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.userId !== userId) {
      throw new ForbiddenException();
    }
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Order is not awaiting delivery confirmation');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CONFIRMED },
      });
      await tx.notification.create({
        data: {
          userId: order.cook.userId,
          type: NotificationType.ORDER_UPDATE,
          title: 'Заказ подтверждён',
          body: 'Клиент подтвердил получение заказа.',
          data: { orderId },
        },
      });
    });

    return this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: { include: { dish: true } }, cook: true },
    });
  }

  async rejectDeliveredOrder(orderId: string, userId: string, reason: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { cook: { select: { userId: true } } },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.userId !== userId) {
      throw new ForbiddenException();
    }
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Order is not awaiting delivery confirmation');
    }

    const trimmed = reason.trim();

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          rejectionReason: trimmed,
        },
      });
      await tx.notification.create({
        data: {
          userId: order.cook.userId,
          type: NotificationType.ORDER_UPDATE,
          title: 'Клиент отклонил заказ',
          body: trimmed,
          data: { orderId },
        },
      });
    });

    return this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: { include: { dish: true } }, cook: true },
    });
  }

  async listPendingCookAcceptance(cookId: string, page = 1, limit = 20) {
    const where: Prisma.OrderWhereInput = {
      cookId,
      status: OrderStatus.AWAITING_COOK_ACCEPTANCE,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { items: { include: { dish: true } }, user: true },
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

  async listForUser(userId: string, page = 1, limit = 20, status?: OrderStatus) {
    const where: Prisma.OrderWhereInput = { userId };
    if (status) {
      where.status = status;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { items: { include: { dish: true } }, cook: true },
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

  private cookOrdersWhere(
    cookId: string,
    status?: OrderStatus,
  ): Prisma.OrderWhereInput {
    const base: Prisma.OrderWhereInput = {
      cookId,
      AND: [{ status: { notIn: COOK_HIDDEN_STATUSES } }],
    };
    if (status) {
      base.AND = [...(base.AND as Prisma.OrderWhereInput[]), { status }];
    }
    return base;
  }

  async listForCook(cookId: string, page = 1, limit = 20, status?: OrderStatus) {
    const where = this.cookOrdersWhere(cookId, status);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { items: { include: { dish: true } }, user: true },
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

  async listForAdmin(page = 1, limit = 20, status?: OrderStatus, listAll?: boolean) {
    const where: Prisma.OrderWhereInput = {};
    if (!listAll) {
      where.status = status ?? OrderStatus.AWAITING_COOK_ACCEPTANCE;
    } else if (status) {
      where.status = status;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          items: { include: { dish: true } },
          user: true,
          cook: { include: { user: { select: { firstName: true, lastName: true, phone: true } } } },
        },
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
      include: { items: { include: { dish: true } }, user: true, cook: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (role === Role.USER && order.userId !== userId) {
      throw new ForbiddenException();
    }

    if (role === Role.COOK) {
      if (!cookId || order.cookId !== cookId) {
        throw new ForbiddenException();
      }
      if (COOK_HIDDEN_STATUSES.includes(order.status)) {
        throw new ForbiddenException();
      }
    }

    return order;
  }

  async getOrderByIdForAdmin(orderId: string): Promise<OrderWithAdminInclude> {
    return this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: adminOrderInclude,
    });
  }

  async patchOrderByAdmin(orderId: string, dto: AdminPatchOrderDto): Promise<OrderWithAdminInclude> {
    await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    const data: Prisma.OrderUpdateInput = {};
    if (dto.deliveryAddress !== undefined) {
      data.deliveryAddress = dto.deliveryAddress.trim();
    }
    if (dto.entrance !== undefined) {
      data.entrance = dto.entrance?.trim() || null;
    }
    if (dto.intercom !== undefined) {
      data.intercom = dto.intercom?.trim() || null;
    }
    if (dto.floor !== undefined) {
      data.floor = dto.floor?.trim() || null;
    }
    if (dto.apartment !== undefined) {
      data.apartment = dto.apartment?.trim() || null;
    }
    if (dto.contactPhone !== undefined) {
      data.contactPhone = dto.contactPhone.trim();
    }
    if (dto.checkoutPhotoPath !== undefined) {
      const v = dto.checkoutPhotoPath.trim();
      data.checkoutPhotoPath = v.length === 0 ? null : v;
    }
    if (dto.rejectionReason !== undefined) {
      data.rejectionReason = dto.rejectionReason?.trim() || null;
    }
    if (dto.discountAmount !== undefined) {
      data.discountAmount = dto.discountAmount;
    }
    if (dto.deliveryFee !== undefined) {
      data.deliveryFee = dto.deliveryFee;
    }
    if (dto.totalAmount !== undefined) {
      data.totalAmount = dto.totalAmount;
    }
    if (dto.preparationTimeMinutes !== undefined) {
      data.preparationTimeMinutes = dto.preparationTimeMinutes;
    }

    if (Object.keys(data).length === 0) {
      return this.getOrderByIdForAdmin(orderId);
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data,
    });
    return this.getOrderByIdForAdmin(orderId);
  }

  async setOrderStatusByAdmin(orderId: string, status: OrderStatus): Promise<OrderWithAdminInclude> {
    await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status },
    });
    return this.getOrderByIdForAdmin(orderId);
  }

  async cancelOrderByAdmin(orderId: string, rejectionReason?: string): Promise<OrderWithAdminInclude> {
    await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        rejectionReason: rejectionReason?.trim() || null,
      },
      include: adminOrderInclude,
    });
  }

  async updateStatus(orderId: string, cookId: string, nextStatus: OrderStatus) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.cookId !== cookId) {
      throw new ForbiddenException();
    }

    if (COOK_HIDDEN_STATUSES.includes(order.status)) {
      throw new BadRequestException('Order is not in the kitchen queue yet');
    }

    if (order.status === OrderStatus.AWAITING_COOK_ACCEPTANCE) {
      throw new BadRequestException('Use accept or reject endpoints for this order');
    }

    const validNextStatuses: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.AWAITING_COOK_ACCEPTANCE]: [],
      [OrderStatus.AWAITING_PAYMENT]: [],
      [OrderStatus.PENDING]: [OrderStatus.CONFIRMED],
      [OrderStatus.CONFIRMED]: [OrderStatus.COOKING],
      [OrderStatus.COOKING]: [OrderStatus.READY],
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
      const cancellableUserStatuses: OrderStatus[] = [
        OrderStatus.AWAITING_COOK_ACCEPTANCE,
        OrderStatus.AWAITING_PAYMENT,
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
      ];
      if (!cancellableUserStatuses.includes(order.status)) {
        throw new BadRequestException('Cannot cancel after preparation has started');
      }
    }

    if (role === Role.COOK) {
      if (!cookId || order.cookId !== cookId) {
        throw new ForbiddenException();
      }
      if (order.status === OrderStatus.AWAITING_COOK_ACCEPTANCE) {
        throw new BadRequestException('Decline this order using the reject endpoint with a reason');
      }
      if (COOK_HIDDEN_STATUSES.includes(order.status)) {
        throw new BadRequestException('Order is not visible to the cook yet');
      }
      if (order.status === OrderStatus.DELIVERED) {
        throw new BadRequestException('Cannot cancel delivered order');
      }
    }

    if (role === Role.ADMIN) {
      throw new ForbiddenException();
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });

    return updated;
  }

  async markOrderPaidByAdmin(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === OrderStatus.AWAITING_PAYMENT) {
      return this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.COOKING,
          paymentStatus: PaymentStatus.COMPLETED,
          paymentProvider: null,
        },
        include: { items: { include: { dish: true } }, user: true, cook: true },
      });
    }

    if (order.status === OrderStatus.COOKING && order.paymentStatus === PaymentStatus.PENDING) {
      return this.prisma.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: PaymentStatus.COMPLETED,
          paymentProvider: null,
        },
        include: { items: { include: { dish: true } }, user: true, cook: true },
      });
    }

    throw new BadRequestException('Order is not awaiting payment in a payable state');
  }
}
