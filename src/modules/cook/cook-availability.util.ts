import { VerificationStatus } from '@prisma/client';

export type CookAvailabilityInput = {
  verificationStatus: VerificationStatus;
  isAvailable: boolean;
  workStartAt: Date | null | string;
  workEndAt: Date | null | string;
};

function parseScheduleDate(value: Date | string | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isCookActiveNow(cook: CookAvailabilityInput, now = new Date()): boolean {
  if (cook.verificationStatus !== VerificationStatus.APPROVED) {
    return false;
  }
  
  const workStartAt = parseScheduleDate(cook.workStartAt);
  const workEndAt = parseScheduleDate(cook.workEndAt);
  
  if (!workStartAt || !workEndAt) {
    return false;
  }
  
  return now >= workStartAt && now <= workEndAt;
}
