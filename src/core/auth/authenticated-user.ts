import { Prisma } from '@prisma/client';

export const AUTH_USER_INCLUDE = {
  cook: { select: { id: true } },
} satisfies Prisma.UserInclude;

export type AuthenticatedUser = Prisma.UserGetPayload<{ include: typeof AUTH_USER_INCLUDE }>;
