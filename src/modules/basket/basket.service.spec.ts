import { BadRequestException } from '@nestjs/common';
import { BasketService } from './basket.service';

describe('BasketService', () => {
  it('creates basket item when cart is empty', async () => {
    const prisma = {
      dish: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'dish-1',
          cookId: 'cook-1',
          isAvailable: true,
        }),
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
              dish: {
                id: 'dish-1',
                name: 'Plov',
                price: 3500,
                imageUrl: '/api/v1/uploads/dishes/plov.jpg',
                isAvailable: true,
              },
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
    };

    const service = new BasketService(prisma as any);
    const result = await service.addItem('user-1', 'dish-1', 2);

    expect(prisma.cartItem.create).toHaveBeenCalled();
    expect(result.itemsCount).toBe(2);
    expect(result.cookId).toBe('cook-1');
  });

  it('rejects adding dish from another cook', async () => {
    const prisma = {
      dish: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'dish-2',
          cookId: 'cook-2',
          isAvailable: true,
        }),
      },
      cart: {
        upsert: jest.fn().mockResolvedValue({
          id: 'cart-1',
          cookId: 'cook-1',
        }),
      },
      cartItem: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const service = new BasketService(prisma as any);

    await expect(service.addItem('user-1', 'dish-2', 1)).rejects.toThrow(BadRequestException);
  });
});
