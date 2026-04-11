import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Express } from 'express';
import { Cook, Prisma, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { StorageService } from '../../core/storage/storage.service';

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const PDF_MIME = 'application/pdf';
const MAX_KITCHEN_PHOTOS = 6;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_PDF_BYTES = 15 * 1024 * 1024;

function extForImageMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    default:
      return '';
  }
}

export interface VerificationUploadResult {
  verificationStatus: VerificationStatus;
  kitchenPhotoUrls: string[];
  healthCertUrl: string;
  certificateUrl: string;
}

@Injectable()
export class CookVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private toPublicUrls(paths: string[]): string[] {
    return paths.map((p) => this.storage.getPublicUrl(p));
  }

  async submitForUser(
    userId: string,
    files: {
      kitchenPhotos?: Express.Multer.File[];
      healthCert?: Express.Multer.File[];
      certificate?: Express.Multer.File[];
    },
  ): Promise<VerificationUploadResult> {
    const cook = await this.prisma.cook.findUnique({
      where: { userId },
    });
    if (!cook) {
      throw new NotFoundException('Cook profile not found');
    }
    return this.submitDocuments(cook, files);
  }

  async submitDocuments(
    cook: Cook,
    files: {
      kitchenPhotos?: Express.Multer.File[];
      healthCert?: Express.Multer.File[];
      certificate?: Express.Multer.File[];
    },
  ): Promise<VerificationUploadResult> {
    const kitchen = files.kitchenPhotos ?? [];
    const health = files.healthCert?.[0];
    const cert = files.certificate?.[0];

    if (kitchen.length < 1 || kitchen.length > MAX_KITCHEN_PHOTOS) {
      throw new BadRequestException(
        `kitchenPhotos must contain between 1 and ${MAX_KITCHEN_PHOTOS} images`,
      );
    }
    if (!health) {
      throw new BadRequestException('healthCert (PDF) is required');
    }
    if (!cert) {
      throw new BadRequestException('certificate (PDF) is required');
    }

    for (const f of kitchen) {
      if (!IMAGE_MIMES.has(f.mimetype)) {
        throw new BadRequestException(
          `Kitchen photo must be JPEG, PNG, or WebP (got ${f.mimetype})`,
        );
      }
      if (f.size > MAX_PHOTO_BYTES) {
        throw new BadRequestException('Each kitchen photo must be at most 8MB');
      }
    }
    for (const f of [health, cert]) {
      if (f.mimetype !== PDF_MIME) {
        throw new BadRequestException(
          `Expected PDF for ${f === health ? 'healthCert' : 'certificate'} (got ${f.mimetype})`,
        );
      }
      if (f.size > MAX_PDF_BYTES) {
        throw new BadRequestException('Each PDF must be at most 15MB');
      }
    }

    const existing = await this.prisma.cookVerification.findUnique({
      where: { cookId: cook.id },
    });
    const oldPaths: string[] = existing
      ? [
          ...existing.kitchenPhotoUrls,
          existing.healthCertUrl,
          existing.certificateUrl,
        ]
      : [];

    const kitchenPaths: string[] = [];
    for (let i = 0; i < kitchen.length; i++) {
      const f = kitchen[i];
      const ext = extForImageMime(f.mimetype);
      const rel = await this.storage.saveVerificationFile(
        cook.id,
        'kitchen',
        i,
        f.buffer,
        ext,
      );
      kitchenPaths.push(rel);
    }

    const healthPath = await this.storage.saveVerificationFile(
      cook.id,
      'healthCert',
      undefined,
      health.buffer,
      '.pdf',
    );
    const certPath = await this.storage.saveVerificationFile(
      cook.id,
      'certificate',
      undefined,
      cert.buffer,
      '.pdf',
    );

    await this.storage.removeStoredFiles(oldPaths);

    await this.prisma.$transaction([
      this.prisma.cookVerification.upsert({
        where: { cookId: cook.id },
        create: {
          cookId: cook.id,
          kitchenPhotoUrls: kitchenPaths,
          healthCertUrl: healthPath,
          certificateUrl: certPath,
        },
        update: {
          kitchenPhotoUrls: kitchenPaths,
          healthCertUrl: healthPath,
          certificateUrl: certPath,
          rejectionReason: null,
        },
      }),
      this.prisma.cook.update({
        where: { id: cook.id },
        data: { verificationStatus: VerificationStatus.UNDER_REVIEW },
      }),
    ]);

    return {
      verificationStatus: VerificationStatus.UNDER_REVIEW,
      kitchenPhotoUrls: this.toPublicUrls(kitchenPaths),
      healthCertUrl: this.storage.getPublicUrl(healthPath),
      certificateUrl: this.storage.getPublicUrl(certPath),
    };
  }

  async findManyForCrm(query: {
    page: number;
    limit: number;
    status?: VerificationStatus;
  }) {
    const { page, limit, status } = query;
    const where: Prisma.CookWhereInput = {};
    if (status !== undefined) {
      where.verificationStatus = status;
    }

    const [total, cooks] = await this.prisma.$transaction([
      this.prisma.cook.count({ where }),
      this.prisma.cook.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              phone: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          verification: true,
        },
      }),
    ]);

    const items = cooks.map((c) => this.mapCookVerificationRow(c));
    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOneForCrm(cookId: string) {
    const cook = await this.prisma.cook.findUnique({
      where: { id: cookId },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        verification: true,
      },
    });
    if (!cook) {
      throw new NotFoundException('Cook not found');
    }
    return this.mapCookVerificationRow(cook);
  }

  private mapCookVerificationRow(
    cook: Cook & {
      user: {
        id: string;
        phone: string;
        firstName: string;
        lastName: string | null;
        email: string | null;
      };
      verification: {
        id: string;
        kitchenPhotoUrls: string[];
        healthCertUrl: string;
        certificateUrl: string;
        rejectionReason: string | null;
        createdAt: Date;
        updatedAt: Date;
      } | null;
    },
  ) {
    const v = cook.verification;
    return {
      cookId: cook.id,
      businessName: cook.businessName,
      verificationStatus: cook.verificationStatus,
      user: cook.user,
      documents: v
        ? {
            kitchenPhotoUrls: this.toPublicUrls(v.kitchenPhotoUrls),
            healthCertUrl: this.storage.getPublicUrl(v.healthCertUrl),
            certificateUrl: this.storage.getPublicUrl(v.certificateUrl),
            rejectionReason: v.rejectionReason,
            submittedAt: v.createdAt,
            updatedAt: v.updatedAt,
          }
        : null,
    };
  }

  async updateStatusByAdmin(
    cookId: string,
    status: VerificationStatus,
    rejectionReason?: string,
  ) {
    const cook = await this.prisma.cook.findUnique({
      where: { id: cookId },
      include: { verification: true },
    });
    if (!cook) {
      throw new NotFoundException('Cook not found');
    }
    if (!cook.verification) {
      throw new ConflictException('Cook has not submitted verification documents yet');
    }

    if (status === VerificationStatus.REJECTED) {
      if (!rejectionReason?.trim()) {
        throw new BadRequestException(
          'rejectionReason is required when status is REJECTED',
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.cook.update({
        where: { id: cookId },
        data: { verificationStatus: status },
      }),
      this.prisma.cookVerification.update({
        where: { cookId },
        data: {
          rejectionReason:
            status === VerificationStatus.REJECTED
              ? rejectionReason!.trim()
              : null,
        },
      }),
    ]);

    const updated = await this.prisma.cook.findUnique({
      where: { id: cookId },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        verification: true,
      },
    });
    if (!updated) {
      throw new NotFoundException('Cook not found');
    }
    return this.mapCookVerificationRow(updated);
  }
}
