import { NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Role, VerificationStatus } from '@prisma/client';
import { StatsService } from './stats.service';

describe('StatsService', () => {
  const start = new Date('2026-05-24T00:00:00.000Z');
  const end = new Date('2026-05-25T00:00:00.000Z');

  it('getCookStats aggregates counts and revenue', async () => {
    const prisma = {
      cook: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cook-1',
          rating: 4.5,
          totalReviews: 12,
          isAvailable: true,
          workStartAt: new Date('2000-01-01T00:00:00.000Z'),
          workEndAt: new Date('2999-01-01T00:00:00.000Z'),
          verificationStatus: VerificationStatus.APPROVED,
        }),
      },
      order: {
        count: jest
          .fn()
          .mockResolvedValueOnce(3)
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(1),
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { totalAmount: 15000 } })
          .mockResolvedValueOnce({ _sum: { totalAmount: 90000 } }),
      },
      dish: { count: jest.fn().mockResolvedValue(8) },
      menu: {
        findUnique: jest.fn().mockResolvedValue({ _count: { dishes: 4 } }),
      },
    };

    const service = new StatsService(prisma as any);
    const result = await service.getCookStats('user-1');

    expect(result.ordersToday).toBe(3);
    expect(result.pendingOrders).toBe(2);
    expect(result.revenueToday).toBe(15000);
    expect(result.revenueTotal).toBe(90000);
    expect(result.countDishes).toBe(8);
    expect(result.menuDishesToday).toBe(4);
    expect(result.isActiveNow).toBe(true);
  });

  it('getCookStats throws when cook missing', async () => {
    const prisma = {
      cook: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new StatsService(prisma as any);
    await expect(service.getCookStats('user-x')).rejects.toThrow(NotFoundException);
  });

  it('getPlatformStats returns platform aggregates', async () => {
    const prisma = {
      user: { count: jest.fn().mockResolvedValue(120) },
      cook: {
        count: jest
          .fn()
          .mockResolvedValueOnce(15)
          .mockResolvedValueOnce(10)
          .mockResolvedValueOnce(2),
      },
      order: {
        count: jest
          .fn()
          .mockResolvedValueOnce(500)
          .mockResolvedValueOnce(12)
          .mockResolvedValueOnce(4),
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { totalAmount: 1_000_000 } })
          .mockResolvedValueOnce({ _sum: { totalAmount: 25_000 } }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'o1',
            orderNumber: 'TT-001',
            status: OrderStatus.COOKING,
            totalAmount: 5000,
            createdAt: new Date('2026-05-24T10:00:00.000Z'),
            cook: { businessName: 'Kitchen A' },
            user: { firstName: 'Ali', lastName: 'B' },
          },
        ]),
      },
    };

    const service = new StatsService(prisma as any);
    const result = await service.getPlatformStats();

    expect(result.totalUsers).toBe(120);
    expect(result.totalCooks).toBe(15);
    expect(result.approvedCooks).toBe(10);
    expect(result.pendingVerifications).toBe(2);
    expect(result.totalOrders).toBe(500);
    expect(result.ordersToday).toBe(12);
    expect(result.awaitingPaymentOrders).toBe(4);
    expect(result.revenueTotal).toBe(1_000_000);
    expect(result.revenueToday).toBe(25_000);
    expect(result.recentOrders).toHaveLength(1);
    expect(result.recentOrders[0].cookName).toBe('Kitchen A');
    expect(prisma.user.count).toHaveBeenCalledWith({ where: { role: Role.USER } });
    expect(prisma.order.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { paymentStatus: PaymentStatus.COMPLETED },
      }),
    );
  });
});
