import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ModerationAction,
  Prisma,
  ReportReason,
  ReportStatus,
  ReportTargetType,
  Role,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { paginationSkip } from '../../common/dto/pagination.dto';
import { CreateContentReportDto, CreateUserBlockDto } from './dto/create-report.dto';
import { ResolveContentReportDto } from './dto/resolve-report.dto';

const SLA_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async listBlockedUserIds(blockerId: string): Promise<string[]> {
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerId },
      select: { blockedUserId: true },
    });
    return rows.map((row) => row.blockedUserId);
  }

  async createReport(reporterId: string, dto: CreateContentReportDto) {
    const targetUserId = await this.resolveTargetUserId(dto.targetType, dto.targetId);
    if (targetUserId === reporterId) {
      throw new BadRequestException('You cannot report yourself');
    }

    const existing = await this.prisma.contentReport.findFirst({
      where: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        status: ReportStatus.PENDING,
      },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.contentReport.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        targetUserId,
        reason: dto.reason,
        details: dto.details?.trim() || null,
      },
    });
  }

  async blockUser(blockerId: string, dto: CreateUserBlockDto) {
    const blockedUserId = await this.resolveBlockedUserId(dto);
    if (blockerId === blockedUserId) {
      throw new BadRequestException('You cannot block yourself');
    }

    const blockedUser = await this.prisma.user.findUnique({
      where: { id: blockedUserId },
      select: { id: true, isActive: true },
    });
    if (!blockedUser?.isActive) {
      throw new NotFoundException('User not found');
    }

    let block;
    try {
      block = await this.prisma.userBlock.create({
        data: {
          blockerId,
          blockedUserId,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('User is already blocked');
      }
      throw error;
    }

    const cook = await this.prisma.cook.findUnique({
      where: { userId: blockedUserId },
      select: { id: true },
    });

    await this.createReport(blockerId, {
      targetType: cook ? ReportTargetType.COOK : ReportTargetType.USER,
      targetId: cook?.id ?? blockedUserId,
      reason: dto.reason ?? ReportReason.OTHER,
      details:
        dto.details?.trim() ||
        'User blocked and reported via in-app block action',
    });

    return block;
  }

  async unblockUser(blockerId: string, blockedUserId: string) {
    const result = await this.prisma.userBlock.deleteMany({
      where: { blockerId, blockedUserId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Block not found');
    }
    return { success: true };
  }

  async listBlocks(blockerId: string) {
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        blockedUserId: true,
        createdAt: true,
        blockedUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
            cook: { select: { id: true, businessName: true } },
          },
        },
      },
    });
    return { items: rows };
  }

  async listReportsForCrm(query: {
    page: number;
    limit: number;
    status?: ReportStatus;
    overdueOnly?: boolean;
  }) {
    const where: Prisma.ContentReportWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.overdueOnly) {
      where.status = ReportStatus.PENDING;
      where.createdAt = { lt: new Date(Date.now() - SLA_MS) };
    }

    const skip = paginationSkip(query.page, query.limit);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contentReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        include: {
          reporter: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
          targetUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              role: true,
              isActive: true,
              cook: { select: { id: true, businessName: true } },
            },
          },
          resolvedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.contentReport.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        isOverdue:
          item.status === ReportStatus.PENDING &&
          Date.now() - item.createdAt.getTime() > SLA_MS,
      })),
      meta: { total, page: query.page, limit: query.limit },
    };
  }

  async resolveReport(
    reportId: string,
    adminId: string,
    dto: ResolveContentReportDto,
  ) {
    const report = await this.prisma.contentReport.findUnique({
      where: { id: reportId },
    });
    if (!report) {
      throw new NotFoundException('Report not found');
    }
    if (report.status !== ReportStatus.PENDING) {
      throw new BadRequestException('Report is already resolved');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.status === ReportStatus.RESOLVED && dto.action) {
        await this.applyModerationAction(tx, report, dto.action);
      }

      return tx.contentReport.update({
        where: { id: reportId },
        data: {
          status: dto.status,
          resolutionAction: dto.action ?? null,
          resolutionNote: dto.resolutionNote?.trim() || null,
          resolvedAt: new Date(),
          resolvedById: adminId,
        },
      });
    });
  }

  private async applyModerationAction(
    tx: Prisma.TransactionClient,
    report: {
      targetType: ReportTargetType;
      targetId: string;
      targetUserId: string;
    },
    action: ModerationAction,
  ) {
    switch (action) {
      case ModerationAction.DEACTIVATE_USER:
        await tx.user.update({
          where: { id: report.targetUserId },
          data: { isActive: false, refreshToken: null },
        });
        break;
      case ModerationAction.HIDE_DISH:
        if (report.targetType !== ReportTargetType.DISH) {
          throw new BadRequestException('HIDE_DISH only applies to dish reports');
        }
        await tx.dish.update({
          where: { id: report.targetId },
          data: { isAvailable: false },
        });
        break;
      case ModerationAction.REJECT_COOK: {
        const cook =
          report.targetType === ReportTargetType.COOK
            ? await tx.cook.findUnique({ where: { id: report.targetId } })
            : await tx.cook.findUnique({ where: { userId: report.targetUserId } });
        if (!cook) {
          throw new NotFoundException('Cook not found for rejection');
        }
        await tx.cook.update({
          where: { id: cook.id },
          data: { verificationStatus: VerificationStatus.REJECTED },
        });
        break;
      }
      default:
        break;
    }
  }

  private async resolveTargetUserId(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<string> {
    switch (targetType) {
      case ReportTargetType.USER: {
        const user = await this.prisma.user.findUnique({
          where: { id: targetId },
          select: { id: true, isActive: true },
        });
        if (!user?.isActive) {
          throw new NotFoundException('User not found');
        }
        return user.id;
      }
      case ReportTargetType.COOK: {
        const cook = await this.prisma.cook.findUnique({
          where: { id: targetId },
          select: { userId: true },
        });
        if (!cook) {
          throw new NotFoundException('Cook not found');
        }
        return cook.userId;
      }
      case ReportTargetType.DISH: {
        const dish = await this.prisma.dish.findUnique({
          where: { id: targetId },
          select: { cook: { select: { userId: true } } },
        });
        if (!dish) {
          throw new NotFoundException('Dish not found');
        }
        return dish.cook.userId;
      }
      default:
        throw new BadRequestException('Unsupported target type');
    }
  }

  private async resolveBlockedUserId(dto: CreateUserBlockDto): Promise<string> {
    if (dto.blockedUserId) {
      return dto.blockedUserId;
    }
    if (dto.cookId) {
      const cook = await this.prisma.cook.findUnique({
        where: { id: dto.cookId },
        select: { userId: true },
      });
      if (!cook) {
        throw new NotFoundException('Cook not found');
      }
      return cook.userId;
    }
    throw new BadRequestException('blockedUserId or cookId is required');
  }
}
