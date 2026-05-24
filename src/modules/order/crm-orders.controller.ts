import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { AdminSetPaymentStatusDto } from './dto/admin-set-payment-status.dto';

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('crm/orders')
export class CrmOrdersController {
  constructor(
    private readonly orderService: OrderService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List orders (admin)',
    description:
      'By default returns orders awaiting payment confirmation (AWAITING_PAYMENT). Pass `listAll=true` for any status, or `status` to filter.',
  })
  async list(@Query() query: ListCrmOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const result = await this.orderService.listForAdmin(page, limit, query.status, query.listAll);
    return { items: result.items, meta: result.meta };
  }

  @Get('payment-instructions')
  @ApiOperation({
    summary: 'Manual payment instructions for CRM',
    description: 'Static recipient phone number where operators verify transfers before marking orders paid.',
  })
  getPaymentInstructions() {
    return {
      recipientPhone: this.configService.get<string>('payment.manualRecipientPhone') ?? null,
    };
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
    summary: 'Confirm manual payment (Paid button)',
    description:
      'Sets paymentStatus to COMPLETED and moves order from AWAITING_PAYMENT to AWAITING_COOK_ACCEPTANCE so the cook can accept.',
  })
  async markPaid(@Param('id') id: string) {
    return this.orderService.markOrderPaidByAdmin(id);
  }

  @Post(':id/payment-status')
  @ApiOperation({
    summary: 'Set order payment status (admin)',
    description:
      'Updates paymentStatus and optional provider/reference. When payment becomes COMPLETED from AWAITING_PAYMENT, status moves to AWAITING_COOK_ACCEPTANCE.',
  })
  async setPaymentStatus(@Param('id') id: string, @Body() body: AdminSetPaymentStatusDto) {
    return this.orderService.setOrderPaymentStatusByAdmin(id, body);
  }

  @Post(':id/status')
  @ApiOperation({
    summary: 'Set order status (admin override)',
    description:
      'Forces status without cook transition rules. Requires paymentStatus COMPLETED. Optional `note` is not persisted.',
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
