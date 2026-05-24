import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express } from 'express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderService } from './order.service';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { Roles } from '../../core/auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../core/auth/authenticated-user';
import { CheckoutOrderDto } from './dto/checkout-order.dto';
import { CheckoutMultipartFormDto } from './dto/checkout-multipart-form.dto';
import { RejectOrderDto } from './dto/reject-order.dto';
import { AcceptCookOrderDto } from './dto/accept-cook-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import type { PrepareFromCartResponseDto } from './dto/prepare-from-cart-response.dto';
import type { CreateOrderResult } from './order.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Roles(Role.USER)
  @Post()
  @ApiOperation({
    summary: 'Create order from cart (checkout payload required)',
    description: 'Creates the order in AWAITING_PAYMENT until CRM confirms manual payment.',
  })
  async createFromCart(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckoutOrderDto,
  ): Promise<CreateOrderResult> {
    return this.orderService.createFromCart(user.id, dto);
  }

  @Roles(Role.USER)
  @Post('prepare')
  @ApiOperation({ summary: 'Validate cart and return checkout totals without creating an order' })
  async prepareFromCart(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckoutOrderDto,
  ): Promise<PrepareFromCartResponseDto> {
    return this.orderService.prepareFromCart(user.id, dto);
  }

  @Roles(Role.USER)
  @Post('checkout-multipart')
  @ApiOperation({
    summary: 'Create order from cart (multipart: address fields + photo, no courier comment)',
    description:
      'Creates the order in AWAITING_PAYMENT until CRM confirms manual payment on the static recipient phone.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['addressLine', 'contactPhone', 'photo'],
      properties: {
        addressLine: { type: 'string' },
        city: { type: 'string' },
        entrance: { type: 'string' },
        intercom: { type: 'string' },
        floor: { type: 'string' },
        apartment: { type: 'string' },
        contactPhone: { type: 'string' },
        saveAddress: { type: 'boolean' },
        savedAddressLabel: { type: 'string' },
        discountAmount: { type: 'integer' },
        photo: { type: 'string', format: 'binary', description: 'JPEG, PNG, or WebP, max 8MB' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async createFromCartMultipart(
    @CurrentUser() user: AuthenticatedUser,
    @Body() form: CheckoutMultipartFormDto,
    @UploadedFile() photo: Express.Multer.File,
  ): Promise<CreateOrderResult> {
    return this.orderService.createFromCartMultipart(user.id, form, photo);
  }

  @Get()
  @ApiOperation({ summary: 'List orders for the current user, cook, or admin' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const status = query.status;

    if (user.role === Role.COOK) {
      if (!user.cook?.id) {
        throw new ForbiddenException('Cook profile is missing');
      }
      const result = await this.orderService.listForCook(user.cook.id, page, limit, status);
      return { items: result.items, meta: result.meta };
    }

    if (user.role === Role.ADMIN) {
      const result = await this.orderService.listForAdmin(page, limit, status, true);
      return { items: result.items, meta: result.meta };
    }

    const result = await this.orderService.listForUser(user.id, page, limit, status);
    return { items: result.items, meta: result.meta };
  }

  @Roles(Role.COOK)
  @Get('cook/pending-acceptance')
  @ApiOperation({
    summary: 'Orders awaiting cook accept/reject',
    description:
      'Paginated list of orders in AWAITING_COOK_ACCEPTANCE for the authenticated cook. Use POST …/accept or …/reject on each order id.',
  })
  async listPendingCookAcceptance(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOrdersQueryDto,
  ) {
    if (!user.cook?.id) {
      throw new ForbiddenException('Cook profile is missing');
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return this.orderService.listPendingCookAcceptance(user.cook.id, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by id' })
  async getById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.orderService.getOrderById(id, user.id, user.role, user.cook?.id);
  }

  @Roles(Role.COOK)
  @Post(':id/accept')
  @ApiOperation({
    summary: 'Accept order awaiting cook (sets preparation time, moves to COOKING)',
  })
  async acceptCookOrder(
    @Param('id') id: string,
    @Body() body: AcceptCookOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!user.cook?.id) {
      throw new ForbiddenException('Cook profile is missing');
    }
    return this.orderService.acceptCookOrder(id, user.cook.id, body.preparationTimeMinutes);
  }

  @Roles(Role.COOK)
  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject order awaiting cook (cancels with reason for the customer)' })
  async rejectCookOrder(
    @Param('id') id: string,
    @Body() body: RejectOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!user.cook?.id) {
      throw new ForbiddenException('Cook profile is missing');
    }
    return this.orderService.rejectCookOrder(id, user.cook.id, body.reason);
  }

  @Roles(Role.USER)
  @Post(':id/delivery/accept')
  @ApiOperation({
    summary: 'Confirm delivered order (customer)',
    description: 'Only when status is DELIVERED. Moves the order to CONFIRMED.',
  })
  async acceptDeliveredOrder(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.orderService.acceptDeliveredOrder(id, user.id);
  }

  @Roles(Role.USER)
  @Post(':id/delivery/reject')
  @ApiOperation({
    summary: 'Reject delivered order (customer)',
    description: 'Only when status is DELIVERED. Cancels the order with a reason.',
  })
  async rejectDeliveredOrder(
    @Param('id') id: string,
    @Body() body: RejectOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orderService.rejectDeliveredOrder(id, user.id, body.reason);
  }

  @Roles(Role.COOK)
  @Patch(':id/status')
  @ApiOperation({
    summary: 'Advance order status (cook)',
    description:
      'Kitchen queue (after cook acceptance). Orders in AWAITING_COOK_ACCEPTANCE must use POST …/accept or …/reject.',
  })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateOrderStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!user.cook?.id) {
      throw new ForbiddenException('Cook profile is missing');
    }
    return this.orderService.updateStatus(id, user.cook.id, body.status);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel order (user or cook)' })
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.orderService.cancel(id, user.id, user.role, user.cook?.id);
  }
}
