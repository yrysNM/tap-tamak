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
import { DishesService } from './dishes.service';
import { ListCrmDishesQueryDto } from './dto/list-crm-dishes-query.dto';

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('crm/dishes')
export class CrmDishesController {
  constructor(private readonly dishesService: DishesService) {}

  @Get()
  @ApiOperation({
    summary: 'List all dishes (paginated, filters)',
    description:
      'Optional filters: `cookId`, `preparationType`, `name` (case-insensitive contains).',
  })
  async list(@Query() query: ListCrmDishesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const result = await this.dishesService.listForCrm({
      page,
      limit,
      cookId: query.cookId,
      preparationType: query.preparationType,
      name: query.name,
    });
    return { items: result.items, meta: result.meta };
  }
}
