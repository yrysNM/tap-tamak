import { VerificationStatus } from '@prisma/client';
import { OrderService } from './order.service';

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
          verificationStatus: VerificationStatus.APPROVED,
          isAvailable: true,
          workStartAt: new Date('2000-01-01T08:00:00.000Z'),
          workEndAt: new Date('2000-01-01T09:00:00.000Z'),
        }),
      },
      address: {
        findFirst: jest.fn().mockResolvedValue({
          street: 'Abay',
          city: 'Almaty',
        }),
      },
      $transaction: jest.fn(),
    };

    const service = new OrderService(prisma as any);

    await expect(service.createFromCart('user-1')).rejects.toThrow(
      'Cook is not active at this time',
    );
  });
});
