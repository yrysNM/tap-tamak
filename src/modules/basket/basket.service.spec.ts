import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BasketService } from './basket.service';

const dishWithCook = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'dish-1',
  name: 'Plov',
  description: 'Rice',
  price: 3500,
  imageUrl: '/api/v1/uploads/dishes/plov.jpg',
  isAvailable: true,
  portionCount: 1,
  cookId: 'cook-1',
  cook: {
    id: 'cook-1',
    businessName: 'Aisulu Kitchen',
    rating: 4.5,
    user: { firstName: 'Aisulu', lastName: 'K' },
  },
  ...overrides,
});

function mockPrismaWithTransaction(base: Record<string, unknown>) {
  const prisma = {
    ...base,
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
  return prisma;
}

describe('BasketService', () => {
  it('creates basket item when cart is empty', async () => {
    const prisma = mockPrismaWithTransaction({
      dish: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'dish-1', cookId: 'cook-1', isAvailable: true },
        ]),
      },
      cart: {
        upsert: jest.fn().mockResolvedValue({
          id: 'cart-1',
          cookId: 'cook-1',
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'cart-1',
          cookId: 'cook-1',
          items: [
            {
              id: 'item-1',
              dishId: 'dish-1',
              quantity: 2,
              dish: dishWithCook(),
            },
          ],
        }),
        update: jest.fn(),
      },
      cartItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
    });

    const service = new BasketService(prisma as any);
    const result = await service.addItems('user-1', [{ dishId: 'dish-1', quantity: 2 }]);

    expect(prisma.dish.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['dish-1'] } },
      select: { id: true, cookId: true, isAvailable: true },
    });
    expect(prisma.cartItem.create).toHaveBeenCalled();
    expect(result.itemsCount).toBe(2);
    expect(result.cookId).toBe('cook-1');
    expect(result.itemsTotal).toBe(7000);
    expect(result.cook?.businessName).toBe('Aisulu Kitchen');
  });

  it('allows adding dishes from another cook', async () => {
    const prisma = mockPrismaWithTransaction({
      dish: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'dish-2', cookId: 'cook-2', isAvailable: true },
        ]),
      },
      cart: {
        upsert: jest.fn().mockResolvedValue({ id: 'cart-1' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'cart-1',
          cookId: null,
          items: [
            {
              id: 'item-1',
              dishId: 'dish-1',
              quantity: 1,
              dish: dishWithCook({ id: 'dish-1', cookId: 'cook-1' }),
            },
            {
              id: 'item-2',
              dishId: 'dish-2',
              quantity: 1,
              dish: dishWithCook({
                id: 'dish-2',
                cookId: 'cook-2',
                name: 'Besh',
                price: 2000,
                cook: {
                  id: 'cook-2',
                  businessName: 'Second Kitchen',
                  rating: 4,
                  user: { firstName: 'B', lastName: 'C' },
                },
              }),
            },
          ],
        }),
        update: jest.fn(),
      },
      cartItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
    });

    const service = new BasketService(prisma as any);
    const result = await service.addItems('user-1', [{ dishId: 'dish-2', quantity: 1 }]);

    expect(prisma.cartItem.create).toHaveBeenCalled();
    expect(result.groups).toHaveLength(2);
    expect(result.cookId).toBeNull();
    expect(result.itemsCount).toBe(2);
  });

  it('adds multiple dishes from the same cook in one request', async () => {
    const prisma = mockPrismaWithTransaction({
      dish: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'dish-1', cookId: 'cook-1', isAvailable: true },
          { id: 'dish-2', cookId: 'cook-1', isAvailable: true },
        ]),
      },
      cart: {
        upsert: jest.fn().mockResolvedValue({ id: 'cart-1', cookId: 'cook-1' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'cart-1',
          cookId: 'cook-1',
          items: [
            {
              id: 'item-1',
              dishId: 'dish-1',
              quantity: 1,
              dish: dishWithCook({ id: 'dish-1', price: 1000 }),
            },
            {
              id: 'item-2',
              dishId: 'dish-2',
              quantity: 2,
              dish: dishWithCook({ id: 'dish-2', price: 500 }),
            },
          ],
        }),
        update: jest.fn(),
      },
      cartItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
    });

    const service = new BasketService(prisma as any);
    const result = await service.addItems('user-1', [
      { dishId: 'dish-1', quantity: 1 },
      { dishId: 'dish-2', quantity: 2 },
    ]);

    expect(prisma.dish.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['dish-1', 'dish-2'] } },
      select: { id: true, cookId: true, isAvailable: true },
    });
    expect(prisma.cartItem.create).toHaveBeenCalledTimes(2);
    expect(result.itemsTotal).toBe(2000);
    expect(result.itemsCount).toBe(3);
  });

  it('merges duplicate dishId lines into one quantity bump', async () => {
    const prisma = mockPrismaWithTransaction({
      dish: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'dish-1', cookId: 'cook-1', isAvailable: true },
        ]),
      },
      cart: {
        upsert: jest.fn().mockResolvedValue({ id: 'cart-1', cookId: 'cook-1' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'cart-1',
          cookId: 'cook-1',
          items: [
            {
              id: 'item-1',
              dishId: 'dish-1',
              quantity: 3,
              dish: dishWithCook(),
            },
          ],
        }),
        update: jest.fn(),
      },
      cartItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
    });

    const service = new BasketService(prisma as any);
    await service.addItems('user-1', [
      { dishId: 'dish-1', quantity: 1 },
      { dishId: 'dish-1', quantity: 2 },
    ]);

    expect(prisma.cartItem.create).toHaveBeenCalledWith({
      data: { cartId: 'cart-1', dishId: 'dish-1', quantity: 3 },
    });
  });

  it('rejects merged quantity over 100 per dish', async () => {
    const prisma = {
      dish: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new BasketService(prisma as any);
    await expect(
      service.addItems('user-1', [
        { dishId: 'dish-1', quantity: 60 },
        { dishId: 'dish-1', quantity: 50 },
      ]),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.dish.findMany).not.toHaveBeenCalled();
  });

  it('throws when a dish id is not found', async () => {
    const prisma = {
      dish: {
        findMany: jest.fn().mockResolvedValue([{ id: 'dish-1', cookId: 'cook-1', isAvailable: true }]),
      },
      $transaction: jest.fn(),
    };
    const service = new BasketService(prisma as any);
    await expect(
      service.addItems('user-1', [
        { dishId: 'dish-1', quantity: 1 },
        { dishId: 'missing-dish', quantity: 1 },
      ]),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws when a dish is not available', async () => {
    const prisma = {
      dish: {
        findMany: jest.fn().mockResolvedValue([{ id: 'dish-1', cookId: 'cook-1', isAvailable: false }]),
      },
      $transaction: jest.fn(),
    };
    const service = new BasketService(prisma as any);
    await expect(service.addItems('user-1', [{ dishId: 'dish-1', quantity: 1 }])).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('getCart returns empty shape when no cart', async () => {
    const prisma = {
      cart: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new BasketService(prisma as any);
    const result = await service.getCart('user-1');
    expect(result.items).toEqual([]);
    expect(result.itemsTotal).toBe(0);
    expect(result.cook).toBeNull();
  });

  it('updateItemQuantity with zero removes the line', async () => {
    const prisma = {
      cartItem: {
        findFirst: jest.fn().mockResolvedValue({ id: 'item-1', cartId: 'cart-1' }),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
      },
      cart: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cart-1',
          cookId: null,
          items: [],
        }),
        delete: jest.fn(),
      },
    };
    const service = new BasketService(prisma as any);
    await service.updateItemQuantity('user-1', 'item-1', 0);
    expect(prisma.cartItem.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
  });

  it('updateItemQuantity updates line and returns totals', async () => {
    const prisma = {
      cartItem: {
        findFirst: jest.fn().mockResolvedValue({ id: 'item-1', cartId: 'cart-1' }),
        update: jest.fn(),
      },
      cart: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cart-1',
          cookId: 'cook-1',
          items: [
            {
              id: 'item-1',
              dishId: 'dish-1',
              quantity: 3,
              dish: dishWithCook({ price: 1000 }),
            },
          ],
        }),
      },
    };
    const service = new BasketService(prisma as any);
    const result = await service.updateItemQuantity('user-1', 'item-1', 3);
    expect(prisma.cartItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { quantity: 3 },
    });
    expect(result.itemsTotal).toBe(3000);
  });

  it('removeItem deletes cart when last line removed', async () => {
    const prisma = {
      cartItem: {
        findFirst: jest.fn().mockResolvedValue({ id: 'item-1', cartId: 'cart-1' }),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      cart: {
        delete: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    const service = new BasketService(prisma as any);
    const result = await service.removeItem('user-1', 'item-1');
    expect(prisma.cart.delete).toHaveBeenCalledWith({ where: { id: 'cart-1' } });
    expect(result.items).toEqual([]);
  });

  it('removeItem throws when line not found', async () => {
    const prisma = {
      cartItem: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new BasketService(prisma as any);
    await expect(service.removeItem('user-1', 'missing')).rejects.toThrow(NotFoundException);
  });

  it('clearCart removes items and cart', async () => {
    const cartDelete = jest.fn();
    const prisma = {
      cart: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cart-1' }),
        delete: cartDelete,
      },
      cartItem: {
        deleteMany: jest.fn(),
      },
    };
    const service = new BasketService(prisma as any);
    await service.clearCart('user-1');
    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 'cart-1' } });
    expect(cartDelete).toHaveBeenCalledWith({ where: { id: 'cart-1' } });
  });
});
