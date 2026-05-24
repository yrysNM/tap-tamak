import { NotFoundException } from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';
import { CookService } from './cook.service';

describe('CookService', () => {
  it('returns cook profile with menu and dishes', async () => {
    const prisma = {
      cook: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cook-1',
          businessName: 'Aspan Kitchen',
          bio: 'Homemade meals',
          rating: 4.8,
          totalReviews: 27,
          latitude: 43.2,
          longitude: 76.9,
          isAvailable: true,
          workStartAt: new Date('2000-01-01T00:00:00.000Z'),
          workEndAt: new Date('2999-01-01T00:00:00.000Z'),
          verificationStatus: VerificationStatus.APPROVED,
          verification: { kitchenPhotoUrls: ['cook-verification/photo-1.jpg'] },
        }),
      },
      menu: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'menu-1',
          date: new Date('2026-04-29T00:00:00.000Z'),
          dishes: [
            {
              id: 'dish-1',
              name: 'Plov',
              description: 'Rice and meat',
              price: 3500,
              imageUrl: '/api/v1/uploads/dishes/cook-1/plov.jpg',
              isAvailable: true,
              cookingTime: 40,
              preparationType: 'LONG',
            },
          ],
        }),
      },
    };
    const storage = {
      getPublicUrl: jest.fn((path: string) => `/api/v1/uploads/${path}`),
    };

    const service = new CookService(prisma as any, storage as any);

    const result = await service.getMenuInformationForClient('cook-1', '2026-04-29');

    expect(result.cook.id).toBe('cook-1');
    expect(result.cook.kitchenPhotoUrls).toEqual(['/api/v1/uploads/cook-verification/photo-1.jpg']);
    expect(result.menu?.id).toBe('menu-1');
    expect(result.dishes).toHaveLength(1);
  });

  it('returns null menu and empty dishes when date has no menu', async () => {
    const prisma = {
      cook: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cook-1',
          businessName: 'Aspan Kitchen',
          bio: null,
          rating: 4.4,
          totalReviews: 10,
          latitude: null,
          longitude: null,
          isAvailable: true,
          workStartAt: new Date('2000-01-01T00:00:00.000Z'),
          workEndAt: new Date('2999-01-01T00:00:00.000Z'),
          verificationStatus: VerificationStatus.APPROVED,
          verification: { kitchenPhotoUrls: [] },
        }),
      },
      menu: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const storage = {
      getPublicUrl: jest.fn((path: string) => `/api/v1/uploads/${path}`),
    };

    const service = new CookService(prisma as any, storage as any);

    const result = await service.getMenuInformationForClient('cook-1', '2026-04-30');

    expect(result.menu).toBeNull();
    expect(result.dishes).toEqual([]);
  });

  it('returns cook informations with average cooking time and dish count', async () => {
    const prisma = {
      cook: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cook-1',
          profileImageUrl: 'cook-profile/cook-1.jpg',
          user: {
            phone: '+77001234567',
            lastName: 'Sarsenov',
          },
        }),
      },
      dish: {
        aggregate: jest.fn().mockResolvedValue({
          _avg: { cookingTime: 35 },
          _count: { _all: 4 },
        }),
      },
    };
    const storage = {
      getPublicUrl: jest.fn((path: string) => `/api/v1/uploads/${path}`),
    };

    const service = new CookService(prisma as any, storage as any);
    const result = await service.getMyInformations('user-1');

    expect(result).toEqual({
      image: '/api/v1/uploads/cook-profile/cook-1.jpg',
      phone: '+77001234567',
      surname: 'Sarsenov',
      avgTimeCooking: 35,
      countDishes: 4,
    });
  });

  it('returns zeroed dish stats when cook has no dishes', async () => {
    const prisma = {
      cook: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cook-1',
          profileImageUrl: null,
          user: {
            phone: '+77005556677',
            lastName: null,
          },
        }),
      },
      dish: {
        aggregate: jest.fn().mockResolvedValue({
          _avg: { cookingTime: null },
          _count: { _all: 0 },
        }),
      },
    };
    const storage = {
      getPublicUrl: jest.fn((path: string) => `/api/v1/uploads/${path}`),
    };

    const service = new CookService(prisma as any, storage as any);
    const result = await service.getMyInformations('user-1');

    expect(result).toEqual({
      image: null,
      phone: '+77005556677',
      surname: null,
      avgTimeCooking: 0,
      countDishes: 0,
    });
  });

  it('returns paginated cooks with countDishes per item', async () => {
    const cookRow = {
      id: 'cook-1',
      businessName: 'Aspan Kitchen',
      bio: 'Homemade meals',
      profileImageUrl: 'cook-profile/cook-1.jpg',
      rating: 4.8,
      totalReviews: 27,
      latitude: 43.2,
      longitude: 76.9,
      isAvailable: true,
      workStartAt: new Date('2000-01-01T00:00:00.000Z'),
      workEndAt: new Date('2999-01-01T00:00:00.000Z'),
      verification: { kitchenPhotoUrls: ['cook-verification/photo-1.jpg'] },
      _count: { dishes: 12 },
    };

    const prisma = {
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      cook: {
        findMany: jest.fn().mockResolvedValue([cookRow]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const storage = {
      getPublicUrl: jest.fn((path: string) => `/api/v1/uploads/${path}`),
    };

    const service = new CookService(prisma as any, storage as any);
    const result = await service.listForClient({ page: 1, limit: 20 });

    expect(result.meta).toEqual({ total: 1, page: 1, limit: 20 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].countDishes).toBe(12);
    expect(result.items[0]).not.toHaveProperty('_count');
    expect(result.items[0].profileImageUrl).toBe('/api/v1/uploads/cook-profile/cook-1.jpg');
  });

  it('throws when cook profile is missing for informations endpoint', async () => {
    const prisma = {
      cook: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      dish: {
        aggregate: jest.fn(),
      },
    };
    const storage = {
      getPublicUrl: jest.fn((path: string) => `/api/v1/uploads/${path}`),
    };

    const service = new CookService(prisma as any, storage as any);

    await expect(service.getMyInformations('user-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.dish.aggregate).not.toHaveBeenCalled();
  });
});
