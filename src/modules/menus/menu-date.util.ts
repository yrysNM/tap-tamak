import { BadRequestException } from '@nestjs/common';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses YYYY-MM-DD as a calendar date at UTC midnight (for Menu.date DATE columns).
 */
export function parseMenuDateUtc(isoDate: string): Date {
  const trimmed = isoDate.trim();
  const m = ISO_DATE.exec(trimmed);
  if (!m) {
    throw new BadRequestException(
      'Invalid date format; expected YYYY-MM-DD',
    );
  }
  const y = Number(m[1]);
  const month = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, month, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== month ||
    dt.getUTCDate() !== d
  ) {
    throw new BadRequestException('Invalid calendar date');
  }
  return dt;
}

export function utcTodayDateOnly(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}
