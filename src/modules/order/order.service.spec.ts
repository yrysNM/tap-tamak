import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Role, VerificationStatus } from '@prisma/client';
import { OrderService } from './order.service';
import { CheckoutOrderDto } from './dto/checkout-order.dto';
import { CheckoutMultipartFormDto } from './dto/checkout-multipart-form.dto';

function storageMock() {
  return {
    saveOrderCheckoutPhoto: jest.fn().mockResolvedValue('orders/user-1/checkout-test.jpg'),
  };
}

function checkoutDto(over: Partial<CheckoutOrderDto> = {}): CheckoutOrderDto {
  return {
    addressLine: 'ул. Абая, 1',
    contactPhone: '+77000000000',
    saveAddress: false,
    ...over,
  };
}

describe('OrderService', () => {
  it('blocks order creation when cook schedule is inactive', async () => {
    const prisma = {
      cart: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cart-1',
          cookId: 'cook-1',
          items: [
            {
              dishId: 'dish-1',
              quantity: 1,
              dish: { id: 'dish-1', cookId: 'cook-1', isAvailable: true, price: 1000, name: 'Plov' },
            },
          ],
        }),
      },
      cook: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cook-1',
          businessName: 'Test',
          rating: 5,
          verificationStatus: VerificationStatus.APPROVED,
          isAvailable: true,
          workStartAt: new Date('2000-01-01T08:00:00.000Z'),
          workEndAt: new Date('2000-01-01T09:00:00.000Z'),
          user: { firstName: 'A', lastName: 'B' },
        }),
      },
      $transaction: jest.fn(),
    };

    const service = new OrderService(prisma as any, storageMock() as any);

    await expect(service.createFromCart('user-1', checkoutDto())).rejects.toThrow(
      'Cook is not active at this time',
    );
  });

  it('prepareFromCart returns dish-only totals without persisting', async () => {
    const now = Date.now();
    const prisma = {
      cart: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cart-1',
          cookId: 'cook-1',
          items: [
            {
              dishId: 'dish-1',
              quantity: 2,
              dish: { id: 'dish-1', cookId: 'cook-1', isAvailable: true, price: 1500, name: 'Soup' },
            },
          ],
        }),
      },
      cook: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cook-1',
          businessName: 'Aliya',
          rating: 4.8,
          verificationStatus: VerificationStatus.APPROVED,
          isAvailable: true,
          workStartAt: new Date(now - 3600000),
          workEndAt: new Date(now + 3600000),
          user: { firstName: 'Aliya', lastName: 'K' },
        }),
      },
      $transaction: jest.fn(),
    };

    const service = new OrderService(prisma as any, storageMock() as any);
    const dto = checkoutDto({ city: 'Almaty', discountAmount: 0 });
    const result = await service.prepareFromCart('user-1', dto);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result.itemsTotal).toBe(3000);
    expect(result.totalAmount).toBe(3000);
    expect(result.discountAmount).toBe(0);
    expect(result.cook.businessName).toBe('Aliya');
    expect(result.basketId).toBe('cart-1');
    expect(result.delivery.addressLine).toBe('ул. Абая, 1');
    expect(result.delivery.city).toBe('Almaty');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].lineSubtotal).toBe(3000);
  });

  it('prepareFromCart ignores delivery fee and discount in final total', async () => {
    const now = Date.now();
    const prisma = {
      cart: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cart-1',
          cookId: 'cook-1',
          items: [
            {
              dishId: 'dish-1',
              quantity: 1,
              dish: { id: 'dish-1', cookId: 'cook-1', isAvailable: true, price: 3000, name: 'Set' },
            },
          ],
        }),
      },
      cook: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cook-1',
          businessName: 'Chef',
          rating: 5,
          verificationStatus: VerificationStatus.APPROVED,
          isAvailable: true,
          workStartAt: new Date(now - 3600000),
          workEndAt: new Date(now + 3600000),
          user: { firstName: 'A', lastName: 'B' },
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new OrderService(prisma as any, storageMock() as any);
    const result = await service.prepareFromCart('user-1', checkoutDto({ discountAmount: 800 }));
    expect(result.itemsTotal).toBe(3000);
    expect(result.deliveryFee).toBe(0);
    expect(result.discountAmount).toBe(0);
    expect(result.totalAmount).toBe(3000);
  });

  it('prepareFromCart rejects empty cart', async () => {
    const prisma = {
      cart: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new OrderService(prisma as any, storageMock() as any);
    await expect(service.prepareFromCart('user-1', checkoutDto())).rejects.toThrow(BadRequestException);
  });

  it('listForCook excludes pre-kitchen statuses', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      order: { findMany, count },
      $transaction: jest.fn((ops: [Promise<unknown>, Promise<unknown>]) => Promise.all(ops)),
    };
    const service = new OrderService(prisma as any, storageMock() as any);
    await service.listForCook('cook-1', 1, 20);
    expect(findMany).toHaveBeenCalled();
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      cookId: 'cook-1',
      AND: expect.arrayContaining([
        { status: { notIn: [OrderStatus.AWAITING_PAYMENT] } },
      ]),
    });
  });

  it('updateStatus rejects cook action on AWAITING_PAYMENT', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'o1',
          cookId: 'cook-1',
          status: OrderStatus.AWAITING_PAYMENT,
        }),
      },
    };
    const service = new OrderService(prisma as any, storageMock() as any);
    await expect(
      service.updateStatus('o1', 'cook-1', OrderStatus.CONFIRMED),
    ).rejects.toThrow(BadRequestException);
  });

  it('markOrderPaidByAdmin from AWAITING_PAYMENT moves to COOKING', async () => {
    const orders: Record<
      string,
      { id: string; userId: string; status: OrderStatus; paymentStatus: PaymentStatus }
    > = {
      o1: {
        id: 'o1',
        userId: 'u1',
        status: OrderStatus.AWAITING_PAYMENT,
        paymentStatus: PaymentStatus.PENDING,
      },
    };

    const orderApi = {
      findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
        Promise.resolve(orders[id] ? { ...orders[id] } : null),
      ),
      update: jest.fn(
        ({
          where: { id },
          data,
        }: {
          where: { id: string };
          data: { status?: OrderStatus; paymentStatus?: PaymentStatus; paymentProvider?: null };
        }) => {
          orders[id] = { ...orders[id], ...data };
          return Promise.resolve({ ...orders[id], items: [], user: {}, cook: {} });
        },
      ),
    };

    const prisma = {
      order: orderApi,
      $transaction: jest.fn(),
    };

    const service = new OrderService(prisma as any, storageMock() as any);
    await service.markOrderPaidByAdmin('o1');
    expect(orders.o1.status).toBe(OrderStatus.COOKING);
    expect(orders.o1.paymentStatus).toBe(PaymentStatus.COMPLETED);
  });

  it('markOrderPaidByAdmin on COOKING with pending payment completes payment only', async () => {
    const orders: Record<
      string,
      { id: string; status: OrderStatus; paymentStatus: PaymentStatus }
    > = {
      o1: { id: 'o1', status: OrderStatus.COOKING, paymentStatus: PaymentStatus.PENDING },
    };
    const orderApi = {
      findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
        Promise.resolve(orders[id] ? { ...orders[id] } : null),
      ),
      update: jest.fn(
        ({
          where: { id },
          data,
        }: {
          where: { id: string };
          data: { status?: OrderStatus; paymentStatus?: PaymentStatus; paymentProvider?: null };
        }) => {
          orders[id] = { ...orders[id], ...data };
          return Promise.resolve({ ...orders[id], items: [], user: {}, cook: {} });
        },
      ),
    };
    const prisma = { order: orderApi, $transaction: jest.fn() };
    const service = new OrderService(prisma as any, storageMock() as any);
    await service.markOrderPaidByAdmin('o1');
    expect(orders.o1.status).toBe(OrderStatus.COOKING);
    expect(orders.o1.paymentStatus).toBe(PaymentStatus.COMPLETED);
  });

  it('getOrderById forbids cook for AWAITING_PAYMENT', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'o1',
          userId: 'u1',
          cookId: 'cook-1',
          status: OrderStatus.AWAITING_PAYMENT,
        }),
      },
    };
    const service = new OrderService(prisma as any, storageMock() as any);
    await expect(service.getOrderById('o1', 'u1', Role.COOK, 'cook-1')).rejects.toThrow(ForbiddenException);
  });

  it('getOrderById allows cook for AWAITING_COOK_ACCEPTANCE', async () => {
    const order = {
      id: 'o1',
      userId: 'u1',
      cookId: 'cook-1',
      status: OrderStatus.AWAITING_COOK_ACCEPTANCE,
      items: [],
      user: {},
      cook: {},
    };
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
      },
    };
    const service = new OrderService(prisma as any, storageMock() as any);
    await expect(service.getOrderById('o1', 'u1', Role.COOK, 'cook-1')).resolves.toEqual(order);
  });

  it('createFromCart persists order basketId with dish-only total', async () => {
    const now = Date.now();
    let createData: { basketId?: string; totalAmount?: number; status?: OrderStatus } = {};
    const mockTx = {
      order: {
        create: jest.fn().mockImplementation(({ data }: { data: typeof createData }) => {
          createData = data;
          return Promise.resolve({ id: 'ord-json', ...data });
        }),
      },
      orderItem: { createMany: jest.fn() },
      cartItem: { deleteMany: jest.fn() },
      cart: { delete: jest.fn() },
      address: { updateMany: jest.fn(), create: jest.fn() },
    };
    const prisma = {
      cart: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cart-1',
          cookId: 'cook-1',
          items: [
            {
              dishId: 'dish-1',
              quantity: 2,
              dish: { id: 'dish-1', cookId: 'cook-1', isAvailable: true, price: 1200, name: 'Lagman' },
            },
          ],
        }),
      },
      cook: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cook-1',
          businessName: 'Chef',
          rating: 5,
          verificationStatus: VerificationStatus.APPROVED,
          isAvailable: true,
          workStartAt: new Date(now - 3600000),
          workEndAt: new Date(now + 3600000),
          user: { firstName: 'A', lastName: 'B' },
        }),
      },
      $transaction: jest.fn(async (fn: (tx: typeof mockTx) => Promise<{ id: string }>) => fn(mockTx)),
    };

    const service = new OrderService(prisma as any, storageMock() as any);
    const result = await service.createFromCart('user-1', checkoutDto({ discountAmount: 300 }));
    expect(result.orderId).toBe('ord-json');
    expect(createData.basketId).toBe('cart-1');
    expect(createData.totalAmount).toBe(2400);
    expect(createData.status).toBe(OrderStatus.AWAITING_COOK_ACCEPTANCE);
  });

  it('createFromCartMultipart creates AWAITING_COOK_ACCEPTANCE and saves photo', async () => {
    const storage = storageMock();
    const now = Date.now();
    let createData: {
      status?: OrderStatus;
      basketId?: string;
      totalAmount?: number;
      checkoutPhotoPath?: string | null;
      courierComment?: null;
    } =
      {};
    const mockTx = {
      order: {
        create: jest.fn().mockImplementation(({ data }: { data: typeof createData }) => {
          createData = data;
          return Promise.resolve({ id: 'ord-new', ...data });
        }),
      },
      orderItem: { createMany: jest.fn() },
      cartItem: { deleteMany: jest.fn() },
      cart: { delete: jest.fn() },
      address: { updateMany: jest.fn(), create: jest.fn() },
    };
    const prisma = {
      cart: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cart-1',
          cookId: 'cook-1',
          items: [
            {
              dishId: 'd1',
              quantity: 1,
              dish: { id: 'd1', cookId: 'cook-1', isAvailable: true, price: 100, name: 'Soup' },
            },
          ],
        }),
      },
      cook: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cook-1',
          businessName: 'Chef',
          rating: 5,
          verificationStatus: VerificationStatus.APPROVED,
          isAvailable: true,
          workStartAt: new Date(now - 3600000),
          workEndAt: new Date(now + 3600000),
          user: { firstName: 'A', lastName: 'B' },
        }),
      },
      $transaction: jest.fn(async (fn: (tx: typeof mockTx) => Promise<{ id: string }>) => fn(mockTx)),
    };
    const service = new OrderService(prisma as any, storage as any);
    const form: CheckoutMultipartFormDto = {
      addressLine: 'ул. Тест, 1',
      contactPhone: '+77000000000',
      saveAddress: false,
    };
    const photo = { buffer: Buffer.from('fake'), mimetype: 'image/jpeg', size: 4 } as any;
    const result = await service.createFromCartMultipart('user-1', form, photo);
    expect(result.orderId).toBe('ord-new');
    expect(createData.status).toBe(OrderStatus.AWAITING_COOK_ACCEPTANCE);
    expect(createData.basketId).toBe('cart-1');
    expect(createData.totalAmount).toBe(100);
    expect(createData.checkoutPhotoPath).toBe('orders/user-1/checkout-test.jpg');
    expect(createData.courierComment).toBeNull();
    expect(storage.saveOrderCheckoutPhoto).toHaveBeenCalled();
  });

  it('acceptCookOrder moves to COOKING with cook preparation time', async () => {
    const notifications: unknown[] = [];
    let updatePayload: { status?: OrderStatus; preparationTimeMinutes?: number } = {};
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValueOnce({
          id: 'o1',
          userId: 'u1',
          cookId: 'cook-1',
          status: OrderStatus.AWAITING_COOK_ACCEPTANCE,
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'o1',
          preparationTimeMinutes: 35,
          items: [],
          user: {},
          cook: { user: {} },
        }),
      },
      $transaction: jest.fn(async (fn: (tx: { order: { update: jest.Mock }; notification: { create: jest.Mock } }) => Promise<void>) => {
        await fn({
          order: {
            update: jest.fn(({ data }: { data: typeof updatePayload }) => {
              updatePayload = data;
              return Promise.resolve({});
            }),
          },
          notification: {
            create: jest.fn((args: { data: unknown }) => {
              notifications.push(args.data);
              return Promise.resolve({});
            }),
          },
        });
      }),
    };
    const service = new OrderService(prisma as any, storageMock() as any);
    const out = await service.acceptCookOrder('o1', 'cook-1', 35);
    expect(out.preparationTimeMinutes).toBe(35);
    expect(out.order.id).toBe('o1');
    expect(updatePayload.status).toBe(OrderStatus.COOKING);
    expect(updatePayload.preparationTimeMinutes).toBe(35);
    expect(notifications).toHaveLength(1);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('rejectCookOrder cancels with reason', async () => {
    const notifications: unknown[] = [];
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'o1',
          userId: 'u1',
          cookId: 'cook-1',
          status: OrderStatus.AWAITING_COOK_ACCEPTANCE,
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'o1',
          status: OrderStatus.CANCELLED,
          rejectionReason: 'Too busy',
          items: [],
          user: {},
          cook: { user: {} },
        }),
      },
      $transaction: jest.fn(async (fn: (tx: { order: { update: jest.Mock }; notification: { create: jest.Mock } }) => Promise<void>) => {
        await fn({
          order: { update: jest.fn() },
          notification: {
            create: jest.fn((args: { data: unknown }) => {
              notifications.push(args.data);
              return Promise.resolve({});
            }),
          },
        });
      }),
    };
    const service = new OrderService(prisma as any, storageMock() as any);
    const order = await service.rejectCookOrder('o1', 'cook-1', 'Too busy');
    expect(order.rejectionReason).toBe('Too busy');
    expect(notifications).toHaveLength(1);
  });

  it('updateStatus rejects AWAITING_COOK_ACCEPTANCE', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'o1',
          cookId: 'cook-1',
          status: OrderStatus.AWAITING_COOK_ACCEPTANCE,
        }),
      },
    };
    const service = new OrderService(prisma as any, storageMock() as any);
    await expect(service.updateStatus('o1', 'cook-1', OrderStatus.CONFIRMED)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('acceptDeliveredOrder moves DELIVERED to CONFIRMED', async () => {
    const notifications: unknown[] = [];
    let updatePayload: { status?: OrderStatus } = {};
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValueOnce({
          id: 'o1',
          userId: 'u1',
          status: OrderStatus.DELIVERED,
          cook: { userId: 'cook-user-1' },
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'o1',
          status: OrderStatus.CONFIRMED,
          items: [],
          cook: {},
        }),
      },
      $transaction: jest.fn(async (fn: (tx: { order: { update: jest.Mock }; notification: { create: jest.Mock } }) => Promise<void>) => {
        await fn({
          order: {
            update: jest.fn(({ data }: { data: typeof updatePayload }) => {
              updatePayload = data;
              return Promise.resolve({});
            }),
          },
          notification: {
            create: jest.fn((args: { data: unknown }) => {
              notifications.push(args.data);
              return Promise.resolve({});
            }),
          },
        });
      }),
    };
    const service = new OrderService(prisma as any, storageMock() as any);
    const order = await service.acceptDeliveredOrder('o1', 'u1');
    expect(order.status).toBe(OrderStatus.CONFIRMED);
    expect(updatePayload.status).toBe(OrderStatus.CONFIRMED);
    expect(notifications).toHaveLength(1);
    expect((notifications[0] as { userId: string }).userId).toBe('cook-user-1');
  });

  it('rejectDeliveredOrder cancels with reason', async () => {
    const notifications: unknown[] = [];
    let updatePayload: { status?: OrderStatus; rejectionReason?: string } = {};
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'o1',
          userId: 'u1',
          status: OrderStatus.DELIVERED,
          cook: { userId: 'cook-user-1' },
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'o1',
          status: OrderStatus.CANCELLED,
          rejectionReason: 'Wrong items',
          items: [],
          cook: {},
        }),
      },
      $transaction: jest.fn(async (fn: (tx: { order: { update: jest.Mock }; notification: { create: jest.Mock } }) => Promise<void>) => {
        await fn({
          order: {
            update: jest.fn(({ data }: { data: typeof updatePayload }) => {
              updatePayload = data;
              return Promise.resolve({});
            }),
          },
          notification: {
            create: jest.fn((args: { data: unknown }) => {
              notifications.push(args.data);
              return Promise.resolve({});
            }),
          },
        });
      }),
    };
    const service = new OrderService(prisma as any, storageMock() as any);
    const order = await service.rejectDeliveredOrder('o1', 'u1', 'Wrong items');
    expect(order.rejectionReason).toBe('Wrong items');
    expect(updatePayload.status).toBe(OrderStatus.CANCELLED);
    expect(updatePayload.rejectionReason).toBe('Wrong items');
    expect(notifications).toHaveLength(1);
  });

  it('acceptDeliveredOrder rejects non-DELIVERED status', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'o1',
          userId: 'u1',
          status: OrderStatus.COOKING,
          cook: { userId: 'cook-user-1' },
        }),
      },
    };
    const service = new OrderService(prisma as any, storageMock() as any);
    await expect(service.acceptDeliveredOrder('o1', 'u1')).rejects.toThrow(BadRequestException);
  });

  it('setOrderStatusByAdmin forces status', async () => {
    const fullOrder = {
      id: 'o1',
      status: OrderStatus.COOKING,
      items: [],
      user: {},
      cook: { user: { firstName: 'a', lastName: 'b', phone: '1' } },
    };
    const prisma = {
      order: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ id: 'o1' })
          .mockResolvedValueOnce(fullOrder),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new OrderService(prisma as any, storageMock() as any);
    const out = await service.setOrderStatusByAdmin('o1', OrderStatus.COOKING);
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { status: OrderStatus.COOKING },
    });
    expect(out.status).toBe(OrderStatus.COOKING);
  });
});
