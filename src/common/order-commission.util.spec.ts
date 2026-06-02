import {
  COMMISSION_PERCENT,
  computeCommissionFromAggregateOrders,
  computeCommissionFromAggregateTotal,
  computeOrderCommission,
  orderFoodSubtotal,
} from './order-commission.util';
import { DELIVERY_FEE } from './order-pricing.constants';

describe('order-commission.util', () => {
  it('uses 12% commission rate', () => {
    expect(COMMISSION_PERCENT).toBe(12);
  });

  it('computes commission with floor rounding', () => {
    expect(computeOrderCommission(10_000)).toEqual({
      commissionPercent: 12,
      commission: 1200,
      platformFee: 1200,
      platformFeePercent: 12,
      cookPayout: 8800,
    });
  });

  it('floors fractional commission amounts', () => {
    const result = computeOrderCommission(1005);
    expect(result.commission).toBe(120);
    expect(result.cookPayout).toBe(885);
    expect(result.commission + result.cookPayout).toBe(1005);
  });

  it('handles zero and negative totals safely', () => {
    expect(computeOrderCommission(0).commission).toBe(0);
    expect(computeOrderCommission(-50).commission).toBe(0);
  });

  it('derives aggregate commission from summed totals', () => {
    expect(computeCommissionFromAggregateTotal(25_000)).toEqual({
      commission: 3000,
      cookPayout: 22_000,
    });
  });

  it('excludes delivery fees from aggregate commission', () => {
    expect(computeCommissionFromAggregateOrders(26_000, DELIVERY_FEE)).toEqual({
      commission: 3000,
      cookPayout: 22_000,
    });
  });

  it('computes commission from food subtotal when attaching to orders', () => {
    expect(orderFoodSubtotal({ totalAmount: 4100, deliveryFee: DELIVERY_FEE })).toBe(3100);
    expect(computeOrderCommission(orderFoodSubtotal({ totalAmount: 4100, deliveryFee: DELIVERY_FEE }))).toEqual({
      commissionPercent: 12,
      commission: 372,
      platformFee: 372,
      platformFeePercent: 12,
      cookPayout: 2728,
    });
  });
});
