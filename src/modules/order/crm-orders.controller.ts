import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { Roles } from '../../core/auth/decorators/roles.decorator';
import { OrderService } from './order.service';
import { ListCrmOrdersQueryDto } from './dto/list-crm-orders-query.dto';
import { AdminPatchOrderDto } from './dto/admin-patch-order.dto';
import { AdminSetOrderStatusDto } from './dto/admin-set-order-status.dto';
import { AdminCancelOrderDto } from './dto/admin-cancel-order.dto';

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('crm/orders')
export class CrmOrdersController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @ApiOperation({
    summary: 'List orders (admin)',
    description:
      'By default returns orders awaiting cook acceptance. Pass `listAll=true` for any status, or `status` to filter.',
  })
  async list(@Query() query: ListCrmOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const result = await this.orderService.listForAdmin(page, limit, query.status, query.listAll);
    return { items: result.items, meta: result.meta };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by id (admin)' })
  async getById(@Param('id') id: string) {
    return this.orderService.getOrderByIdForAdmin(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Patch order fields (admin)',
    description:
      'Partial update of delivery fields, amounts, checkout photo path, rejection reason, preparation time.',
  })
  async patch(@Param('id') id: string, @Body() body: AdminPatchOrderDto) {
    return this.orderService.patchOrderByAdmin(id, body);
  }

  @Post(':id/mark-paid')
  @ApiOperation({
    summary: 'Mark order as manually paid',
    description:
      'From AWAITING_PAYMENT moves to COOKING with payment completed. From COOKING with pending payment, completes payment only.',
  })
  async markPaid(@Param('id') id: string) {
    return this.orderService.markOrderPaidByAdmin(id);
  }

  @Post(':id/status')
  @ApiOperation({
    summary: 'Set order status (admin override)',
    description: 'Forces status without cook transition rules. Optional `note` is not persisted.',
  })
  async setStatus(@Param('id') id: string, @Body() body: AdminSetOrderStatusDto) {
    return this.orderService.setOrderStatusByAdmin(id, body.status);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel order (admin)' })
  async cancel(@Param('id') id: string, @Body() body: AdminCancelOrderDto) {
    return this.orderService.cancelOrderByAdmin(id, body.rejectionReason);
  }
}
