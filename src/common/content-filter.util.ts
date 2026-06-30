import { BadRequestException } from '@nestjs/common';

const BLOCKED_PATTERNS: RegExp[] = [
  /\b(fuck|shit|bitch|asshole|bastard|damn)\b/i,
  /\b(хуй|хуя|пизд|еба|ёба|бля|сука|мудак|дебил)\b/i,
  /\b(қотақ|сөкп|қарғыс)\b/i,
];

export function containsBlockedContent(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function assertCleanText(fields: string[], label = 'Content'): void {
  for (const field of fields) {
    if (containsBlockedContent(field)) {
      throw new BadRequestException(
        `${label} contains language that is not allowed on TapTamaq`,
      );
    }
  }
}
