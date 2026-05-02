import { VerificationStatus } from '@prisma/client';
import { isCookActiveNow } from './cook-availability.util';

describe('isCookActiveNow', () => {
  it('returns true only inside schedule window', () => {
    const cook = {
      verificationStatus: VerificationStatus.APPROVED,
      isAvailable: true,
      workStartAt: new Date('2026-04-26T08:00:00.000Z'),
      workEndAt: new Date('2026-04-26T18:00:00.000Z'),
    };

    expect(isCookActiveNow(cook, new Date('2026-04-26T10:00:00.000Z'))).toBe(true);
    expect(isCookActiveNow(cook, new Date('2026-04-26T18:00:00.000Z'))).toBe(false);
    expect(isCookActiveNow(cook, new Date('2026-04-26T07:59:59.999Z'))).toBe(false);
  });

  it('returns false when schedule is missing or cook is not approved', () => {
    expect(
      isCookActiveNow({
        verificationStatus: VerificationStatus.PENDING,
        isAvailable: true,
        workStartAt: new Date('2026-04-26T08:00:00.000Z'),
        workEndAt: new Date('2026-04-26T18:00:00.000Z'),
      }),
    ).toBe(false);

    expect(
      isCookActiveNow({
        verificationStatus: VerificationStatus.APPROVED,
        isAvailable: true,
        workStartAt: null,
        workEndAt: null,
      }),
    ).toBe(false);
  });

  it('accepts ISO string datetimes and handles invalid values', () => {
    const cookWithStrings = {
      verificationStatus: VerificationStatus.APPROVED,
      isAvailable: true,
      workStartAt: '2026-04-29T18:00:00.000Z',
      workEndAt: '2026-04-29T23:00:00.000Z',
    };

    expect(isCookActiveNow(cookWithStrings, new Date('2026-04-29T20:00:00.000Z'))).toBe(true);
    expect(isCookActiveNow(cookWithStrings, new Date('2026-04-29T23:00:00.000Z'))).toBe(false);

    expect(
      isCookActiveNow({
        ...cookWithStrings,
        workStartAt: 'invalid-date',
      }),
    ).toBe(false);
  });
});
