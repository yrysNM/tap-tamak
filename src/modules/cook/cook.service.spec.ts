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
});
