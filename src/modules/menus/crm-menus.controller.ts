import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { Roles } from '../../core/auth/decorators/roles.decorator';
import { MenusService } from './menus.service';
import { ListCrmMenusQueryDto } from './dto/list-crm-menus-query.dto';

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('crm/menus')
export class CrmMenusController {
  constructor(private readonly menusService: MenusService) {}

  @Get()
  @ApiOperation({
    summary: 'List all menus (paginated)',
    description:
      'Optional filters: `cookId`, date range `from` / `to` (YYYY-MM-DD, UTC, inclusive).',
  })
  async list(@Query() query: ListCrmMenusQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const result = await this.menusService.listForCrm({
      page,
      limit,
      cookId: query.cookId,
      from: query.from,
      to: query.to,
    });
    return { items: result.items, meta: result.meta };
  }
}
