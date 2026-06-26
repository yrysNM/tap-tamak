import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { DeleteAccountDto } from './dto/delete-account.dto';

const SALT_ROUNDS = 10;

function storageMock() {
  return {
    getPublicUrl: jest.fn((p: string) => `/api/v1/uploads/${p}`),
    removeStoredFiles: jest.fn().mockResolvedValue(undefined),
  };
}

function baseUser(over: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    phone: '+77001112233',
    email: 'user@example.com',
    passwordHash: '',
    firstName: 'Aida',
    lastName: 'K',
    role: Role.USER,
    isActive: true,
    refreshToken: 'hash',
    avatarUrl: 'users/user-1/avatar.jpg',
    cook: null,
    ...over,
  };
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

describe('UsersService.deleteAccount', () => {
  const dto: DeleteAccountDto = { currentPassword: 'secret12' };

  it('anonymizes user and deletes ephemeral data', async () => {
    const passwordHash = await hashPassword('secret12');
    const user = baseUser({ passwordHash });

    const tx = {
      cartItem: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      cart: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      address: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      deviceToken: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      notification: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      favoriteDish: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      favoriteCook: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      review: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      user: { update: jest.fn().mockResolvedValue(user) },
    };

    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
      },
      order: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
    };

    const storage = storageMock();
    const service = new UsersService(prisma as any, storage as any);

    await service.deleteAccount('user-1', dto);

    expect(tx.cartItem.deleteMany).toHaveBeenCalled();
    expect(tx.cart.deleteMany).toHaveBeenCalled();
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          phone: 'deleted-user-1',
          firstName: 'Deleted',
          isActive: false,
          refreshToken: null,
          avatarUrl: null,
        }),
      }),
    );
    expect(storage.removeStoredFiles).toHaveBeenCalledWith(['users/user-1/avatar.jpg']);
  });

  it('rejects wrong password', async () => {
    const passwordHash = await hashPassword('other-pass');
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(baseUser({ passwordHash })),
      },
    };
    const service = new UsersService(prisma as any, storageMock() as any);

    await expect(service.deleteAccount('user-1', dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects inactive user', async () => {
    const passwordHash = await hashPassword('secret12');
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(
          baseUser({ passwordHash, isActive: false }),
        ),
      },
    };
    const service = new UsersService(prisma as any, storageMock() as any);

    await expect(service.deleteAccount('user-1', dto)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects ADMIN role', async () => {
    const passwordHash = await hashPassword('secret12');
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(
          baseUser({ passwordHash, role: Role.ADMIN }),
        ),
      },
    };
    const service = new UsersService(prisma as any, storageMock() as any);

    await expect(service.deleteAccount('user-1', dto)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects when buyer has active order', async () => {
    const passwordHash = await hashPassword('secret12');
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(baseUser({ passwordHash })),
      },
      order: {
        findFirst: jest.fn().mockResolvedValue({ id: 'order-1' }),
      },
    };
    const service = new UsersService(prisma as any, storageMock() as any);

    await expect(service.deleteAccount('user-1', dto)).rejects.toThrow(
      /active orders/,
    );
    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { notIn: [OrderStatus.DELIVERED, OrderStatus.CANCELLED] },
        }),
      }),
    );
  });

  it('rejects cook with active order as seller', async () => {
    const passwordHash = await hashPassword('secret12');
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(
          baseUser({
            passwordHash,
            role: Role.COOK,
            cook: {
              id: 'cook-1',
              profileImageUrl: null,
              verification: null,
            },
          }),
        ),
      },
      order: {
        findFirst: jest.fn().mockResolvedValue({ id: 'order-2' }),
      },
    };
    const service = new UsersService(prisma as any, storageMock() as any);

    await expect(service.deleteAccount('user-1', dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ userId: 'user-1' }, { cookId: 'cook-1' }],
        }),
      }),
    );
  });

  it('keeps dish with order items but marks unavailable', async () => {
    const passwordHash = await hashPassword('secret12');
    const user = baseUser({
      passwordHash,
      role: Role.COOK,
      avatarUrl: null,
      cook: {
        id: 'cook-1',
        profileImageUrl: 'cooks/cook-1/profile.jpg',
        verification: null,
      },
    });

    const tx = {
      cartItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      cart: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      address: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      deviceToken: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      notification: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      favoriteDish: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      favoriteCook: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      review: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      menu: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      dish: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'dish-orphan', _count: { orderItems: 0 } },
          { id: 'dish-sold', _count: { orderItems: 2 } },
        ]),
        delete: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      cookVerification: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      cook: { update: jest.fn().mockResolvedValue({}) },
      user: { update: jest.fn().mockResolvedValue(user) },
    };

    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      order: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      dish: {
        findMany: jest.fn().mockResolvedValue([
          { imageUrl: 'dishes/cook-1/dish-sold.jpg' },
        ]),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
    };

    const storage = storageMock();
    const service = new UsersService(prisma as any, storage as any);

    await service.deleteAccount('user-1', dto);

    expect(tx.dish.delete).toHaveBeenCalledWith({ where: { id: 'dish-orphan' } });
    expect(tx.dish.update).toHaveBeenCalledWith({
      where: { id: 'dish-sold' },
      data: { isAvailable: false, imageUrl: null },
    });
    expect(tx.cook.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ businessName: 'Deleted Cook' }),
      }),
    );
  });
});
