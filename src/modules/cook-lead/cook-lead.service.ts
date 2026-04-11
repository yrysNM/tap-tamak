import { Injectable, NotFoundException } from '@nestjs/common';
import { CookLead, CookLeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateCookLeadDto } from './dto/create-cook-lead.dto';
import { ListCookLeadsQueryDto } from './dto/list-cook-leads-query.dto';

@Injectable()
export class CookLeadService {
  constructor(private readonly prisma: PrismaService) {}

  async createFromTilda(
    dto: CreateCookLeadDto,
    rawBody: Record<string, unknown> | undefined,
  ): Promise<CookLead> {
    const email = dto.email.trim().toLowerCase();
    return this.prisma.cookLead.create({
      data: {
        email,
        fullName: dto.fullName.trim(),
        message: dto.message.trim(),
        source: 'tilda',
        rawPayload: rawBody as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async findManyForCms(query: ListCookLeadsQueryDto): Promise<{
    items: CookLead[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CookLeadWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.email?.trim()) {
      where.email = {
        contains: query.email.trim(),
        mode: 'insensitive',
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.cookLead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.cookLead.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(id: string): Promise<CookLead> {
    const lead = await this.prisma.cookLead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException('Cook lead not found');
    }
    return lead;
  }

  async updateStatus(id: string, status: CookLeadStatus): Promise<CookLead> {
    await this.findOne(id);
    return this.prisma.cookLead.update({
      where: { id },
      data: { status },
    });
  }
}
