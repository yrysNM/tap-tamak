import { DELIVERY_FEE } from './order-pricing.constants';

export { DELIVERY_FEE };

/** Platform commission taken from each order total (percentage points). */
export const COMMISSION_PERCENT = 12;

export const COMMISSION_RATE = COMMISSION_PERCENT / 100;

export interface OrderCommissionBreakdown {
  commissionPercent: number;
  /** Platform commission in whole KZT (minor units). */
  commission: number;
  /** Alias kept for checkout / legacy API fields. */
  platformFee: number;
  platformFeePercent: number;
  /** Amount retained by the cook after commission. */
  cookPayout: number;
}

/** Food subtotal used as the commission base (excludes delivery fee). */
export function orderFoodSubtotal(order: {
  totalAmount?: number;
  deliveryFee?: number;
}): number {
  const total = Math.max(0, Math.round(order.totalAmount ?? 0));
  const delivery = Math.max(0, Math.round(order.deliveryFee ?? 0));
  return Math.max(0, total - delivery);
}

/**
 * Computes commission for a single order food subtotal.
 * Uses integer floor rounding so cook payout + commission always equals the food subtotal.
 */
export function computeOrderCommission(totalAmount: number): OrderCommissionBreakdown {
  const safeTotal = Number.isFinite(totalAmount) ? totalAmount : 0;
  const normalized = Math.max(0, Math.round(safeTotal));
  const commission = Math.floor((normalized * COMMISSION_PERCENT) / 100);
  const cookPayout = normalized - commission;
  return {
    commissionPercent: COMMISSION_PERCENT,
    commission,
    platformFee: commission,
    platformFeePercent: COMMISSION_PERCENT,
    cookPayout,
  };
}

/** Derives commission totals from an aggregated food-subtotal sum (dashboard KPIs). */
export function computeCommissionFromAggregateTotal(totalAmountSum: number): {
  commission: number;
  cookPayout: number;
} {
  const { commission, cookPayout } = computeOrderCommission(totalAmountSum);
  return { commission, cookPayout };
}

/** Derives commission from summed order totals minus summed delivery fees. */
export function computeCommissionFromAggregateOrders(
  totalAmountSum: number,
  deliveryFeeSum = 0,
): { commission: number; cookPayout: number } {
  const foodTotal = Math.max(
    0,
    Math.round(totalAmountSum) - Math.max(0, Math.round(deliveryFeeSum)),
  );
  return computeCommissionFromAggregateTotal(foodTotal);
}

export function attachCommissionFields<T extends { totalAmount?: number; deliveryFee?: number }>(
  order: T,
): T & OrderCommissionBreakdown {
  return { ...order, ...computeOrderCommission(orderFoodSubtotal(order)) };
}
