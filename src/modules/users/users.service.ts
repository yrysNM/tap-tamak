import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { OrderStatus, Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { StorageService } from '../../core/storage/storage.service';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { ListCrmUsersQueryDto } from './dto/list-crm-users-query.dto';
import { PatchCrmUserDto } from './dto/patch-crm-user.dto';

const SALT_ROUNDS = 10;

const TERMINAL_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
];

export type CrmUserItem = {
  id: string;
  phone: string;
  email: string | null;
  firstName: string;
  lastName: string | null;
  role: Role;
  isActive: boolean;
  imageUrl: string | null;
  cookId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listForCrm(query: ListCrmUsersQueryDto): Promise<{
    items: CrmUserItem[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};
    if (query.role) {
      where.role = query.role;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { phone: { contains: term, mode: 'insensitive' } },
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          cook: {
            select: { id: true, profileImageUrl: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toCrmUserItem(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOneForCrm(id: string): Promise<CrmUserItem> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        cook: {
          select: { id: true, profileImageUrl: true },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toCrmUserItem(user);
  }

  async updateForCrm(
    id: string,
    dto: PatchCrmUserDto,
    actorId?: string,
  ): Promise<CrmUserItem> {
    await this.findOneForCrm(id);

    if (dto.isActive === false && actorId && actorId === id) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.firstName !== undefined) {
      data.firstName = dto.firstName.trim();
    }
    if (dto.lastName !== undefined) {
      data.lastName = dto.lastName?.trim() || null;
    }
    if (dto.role !== undefined) {
      data.role = dto.role;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
      if (!dto.isActive) {
        data.refreshToken = null;
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      include: {
        cook: {
          select: { id: true, profileImageUrl: true },
        },
      },
    });

    return this.toCrmUserItem(updated);
  }

  async resetPasswordForCrm(id: string, newPassword: string): Promise<void> {
    await this.findOneForCrm(id);
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, refreshToken: null },
    });
  }

  async updateProfileImageForCrm(
    id: string,
    file: { mimetype: string; buffer: Buffer } | undefined,
  ): Promise<{ imageUrl: string }> {
    if (!file) {
      throw new BadRequestException('Profile image file is required');
    }

    const ext = this.getImageExtensionFromMime(file.mimetype);
    if (!ext) {
      throw new BadRequestException('Profile image must be JPEG, PNG, or WebP');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        cook: {
          select: { id: true, profileImageUrl: true },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === Role.COOK && user.cook) {
      const storedPath = await this.storage.saveCookProfileImage(
        user.cook.id,
        file.buffer,
        ext,
      );
      await this.prisma.cook.update({
        where: { id: user.cook.id },
        data: { profileImageUrl: storedPath },
      });
      if (user.cook.profileImageUrl) {
        await this.storage.removeStoredFiles([user.cook.profileImageUrl]);
      }
      return { imageUrl: this.storage.getPublicUrl(storedPath) };
    }

    const storedPath = await this.storage.saveUserAvatar(
      user.id,
      file.buffer,
      ext,
    );
    await this.prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: storedPath },
    });
    if (user.avatarUrl) {
      await this.storage.removeStoredFiles([user.avatarUrl]);
    }

    return { imageUrl: this.storage.getPublicUrl(storedPath) };
  }

  async deleteAccount(userId: string, dto: DeleteAccountDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        cook: {
          include: { verification: true },
        },
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.role === Role.ADMIN) {
      throw new ForbiddenException('Admin accounts cannot be deleted via the app');
    }

    const isCurrentValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isCurrentValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    await this.assertNoActiveOrders(userId, user.cook?.id ?? null);

    const filePaths = await this.collectDeletionFilePaths(userId, user);

    await this.prisma.$transaction(async (tx) => {
      await tx.cartItem.deleteMany({ where: { cart: { userId } } });
      await tx.cart.deleteMany({ where: { userId } });
      await tx.address.deleteMany({ where: { userId } });
      await tx.deviceToken.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.favoriteDish.deleteMany({ where: { userId } });
      await tx.favoriteCook.deleteMany({ where: { userId } });

      await tx.review.updateMany({
        where: { userId },
        data: { comment: null },
      });

      if (user.cook) {
        const cookId = user.cook.id;

        await tx.menu.deleteMany({ where: { cookId } });

        const dishes = await tx.dish.findMany({
          where: { cookId },
          include: { _count: { select: { orderItems: true } } },
        });

        for (const dish of dishes) {
          if (dish._count.orderItems === 0) {
            await tx.dish.delete({ where: { id: dish.id } });
          } else {
            await tx.dish.update({
              where: { id: dish.id },
              data: { isAvailable: false, imageUrl: null },
            });
          }
        }

        await tx.cookVerification.deleteMany({ where: { cookId } });

        await tx.cook.update({
          where: { id: cookId },
          data: {
            businessName: 'Deleted Cook',
            bio: null,
            profileImageUrl: null,
            latitude: null,
            longitude: null,
            isAvailable: false,
            workStartAt: null,
            workEndAt: null,
          },
        });
      }

      const passwordHash = await bcrypt.hash(randomUUID(), SALT_ROUNDS);
      await tx.user.update({
        where: { id: userId },
        data: {
          phone: `deleted-${userId}`,
          email: null,
          firstName: 'Deleted',
          lastName: null,
          passwordHash,
          refreshToken: null,
          isActive: false,
          avatarUrl: null,
        },
      });
    });

    await this.storage.removeStoredFiles(filePaths);
  }

  private async assertNoActiveOrders(
    userId: string,
    cookId: string | null,
  ): Promise<void> {
    const orConditions: Prisma.OrderWhereInput[] = [{ userId }];
    if (cookId) {
      orConditions.push({ cookId });
    }

    const blocking = await this.prisma.order.findFirst({
      where: {
        status: { notIn: TERMINAL_ORDER_STATUSES },
        OR: orConditions,
      },
      select: { id: true },
    });

    if (blocking) {
      throw new BadRequestException(
        'Complete or cancel active orders before deleting your account',
      );
    }
  }

  private async collectDeletionFilePaths(
    userId: string,
    user: User & {
      cook: {
        id: string;
        profileImageUrl: string | null;
        verification: {
          kitchenPhotoUrls: string[];
          healthCertUrl: string | null;
          certificateUrl: string;
        } | null;
      } | null;
    },
  ): Promise<string[]> {
    const paths = new Set<string>();

    if (user.avatarUrl) {
      paths.add(user.avatarUrl);
    }

    if (user.cook) {
      if (user.cook.profileImageUrl) {
        paths.add(user.cook.profileImageUrl);
      }

      const verification = user.cook.verification;
      if (verification) {
        for (const url of verification.kitchenPhotoUrls) {
          if (url) paths.add(url);
        }
        if (verification.healthCertUrl?.trim()) {
          paths.add(verification.healthCertUrl);
        }
        if (verification.certificateUrl) {
          paths.add(verification.certificateUrl);
        }
      }

      const dishes = await this.prisma.dish.findMany({
        where: { cookId: user.cook.id },
        select: { imageUrl: true },
      });
      for (const dish of dishes) {
        if (dish.imageUrl) {
          paths.add(dish.imageUrl);
        }
      }
    }

    const orders = await this.prisma.order.findMany({
      where: { userId },
      select: { checkoutPhotoPath: true },
    });
    for (const order of orders) {
      if (order.checkoutPhotoPath) {
        paths.add(order.checkoutPhotoPath);
      }
    }

    return [...paths];
  }

  private toCrmUserItem(
    user: User & {
      cook: { id: string; profileImageUrl: string | null } | null;
    },
  ): CrmUserItem {
    const storedPath =
      user.role === Role.COOK && user.cook?.profileImageUrl
        ? user.cook.profileImageUrl
        : user.avatarUrl;

    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      imageUrl: storedPath ? this.storage.getPublicUrl(storedPath) : null,
      cookId: user.cook?.id ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private getImageExtensionFromMime(mimetype: string): string | null {
    switch (mimetype) {
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      default:
        return null;
    }
  }
}
