import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { StorageService } from '../../core/storage/storage.service';
import { ListCrmUsersQueryDto } from './dto/list-crm-users-query.dto';
import { PatchCrmUserDto } from './dto/patch-crm-user.dto';

const SALT_ROUNDS = 10;

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
