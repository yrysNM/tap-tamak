import { Injectable, NotFoundException } from '@nestjs/common';
import {
  OrderStatus,
  PaymentStatus,
  Role,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { isCookActiveNow } from '../cook/cook-availability.util';
import { utcTodayDateOnly } from '../menus/menu-date.util';

const COOK_PENDING_STATUSES: OrderStatus[] = [
  OrderStatus.AWAITING_COOK_ACCEPTANCE,
  OrderStatus.COOKING,
  OrderStatus.CONFIRMED,
  OrderStatus.READY,
  OrderStatus.ON_THE_WAY,
];

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  private utcDayBounds(): { start: Date; end: Date } {
    const start = utcTodayDateOnly();
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }

  async getCookStats(userId: string) {
    const cook = await this.prisma.cook.findUnique({
      where: { userId },
      select: {
        id: true,
        rating: true,
        totalReviews: true,
        isAvailable: true,
        workStartAt: true,
        workEndAt: true,
        verificationStatus: true,
      },
    });
    if (!cook) {
      throw new NotFoundException('Cook profile not found');
    }

    const { start, end } = this.utcDayBounds();
    const paidWhere = { cookId: cook.id, paymentStatus: PaymentStatus.COMPLETED };

    const [
      ordersToday,
      pendingOrders,
      revenueTodayAgg,
      revenueTotalAgg,
      completedOrdersToday,
      countDishes,
      menuToday,
    ] = await Promise.all([
      this.prisma.order.count({
        where: { cookId: cook.id, createdAt: { gte: start, lt: end } },
      }),
      this.prisma.order.count({
        where: { cookId: cook.id, status: { in: COOK_PENDING_STATUSES } },
      }),
      this.prisma.order.aggregate({
        where: { ...paidWhere, createdAt: { gte: start, lt: end } },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: paidWhere,
        _sum: { totalAmount: true },
      }),
      this.prisma.order.count({
        where: {
          cookId: cook.id,
          paymentStatus: PaymentStatus.COMPLETED,
          status: OrderStatus.DELIVERED,
          createdAt: { gte: start, lt: end },
        },
      }),
      this.prisma.dish.count({ where: { cookId: cook.id } }),
      this.prisma.menu.findUnique({
        where: { cookId_date: { cookId: cook.id, date: start } },
        select: { _count: { select: { dishes: true } } },
      }),
    ]);

    return {
      rating: cook.rating,
      totalReviews: cook.totalReviews,
      countDishes,
      menuDishesToday: menuToday?._count.dishes ?? 0,
      ordersToday,
      pendingOrders,
      revenueToday: revenueTodayAgg._sum.totalAmount ?? 0,
      revenueTotal: revenueTotalAgg._sum.totalAmount ?? 0,
      completedOrdersToday,
      isActiveNow: isCookActiveNow(cook),
    };
  }

  async getPlatformStats() {
    const { start, end } = this.utcDayBounds();
    const paidWhere = { paymentStatus: PaymentStatus.COMPLETED };

    const [
      totalUsers,
      totalCooks,
      approvedCooks,
      pendingVerifications,
      totalOrders,
      ordersToday,
      awaitingPaymentOrders,
      revenueTotalAgg,
      revenueTodayAgg,
      recentOrders,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: Role.USER } }),
      this.prisma.cook.count(),
      this.prisma.cook.count({
        where: { verificationStatus: VerificationStatus.APPROVED },
      }),
      this.prisma.cook.count({
        where: { verificationStatus: VerificationStatus.UNDER_REVIEW },
      }),
      this.prisma.order.count(),
      this.prisma.order.count({
        where: { createdAt: { gte: start, lt: end } },
      }),
      this.prisma.order.count({
        where: { status: OrderStatus.AWAITING_PAYMENT },
      }),
      this.prisma.order.aggregate({
        where: paidWhere,
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: { ...paidWhere, createdAt: { gte: start, lt: end } },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          createdAt: true,
          cook: { select: { businessName: true } },
          user: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    return {
      totalUsers,
      totalCooks,
      approvedCooks,
      pendingVerifications,
      totalOrders,
      ordersToday,
      awaitingPaymentOrders,
      revenueTotal: revenueTotalAgg._sum.totalAmount ?? 0,
      revenueToday: revenueTodayAgg._sum.totalAmount ?? 0,
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        totalAmount: o.totalAmount,
        createdAt: o.createdAt.toISOString(),
        cookName: o.cook.businessName,
        customerName:
          [o.user.firstName, o.user.lastName].filter(Boolean).join(' ').trim() || '—',
      })),
    };
  }
}
