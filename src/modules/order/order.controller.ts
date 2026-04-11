import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { Roles } from '../../core/auth/decorators/roles.decorator';
import { Role, OrderStatus } from '@prisma/client';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
// import { OrderGateway } from './order.gateway';

interface CurrentUserPayload {
  sub: string;
  role: Role;
  cookId?: string;
}

class ListOrdersQueryDto {
  page?: number;
  limit?: number;
  status?: OrderStatus;
}

class UpdateStatusDto {
  status: OrderStatus;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    // private readonly orderGateway: OrderGateway,
  ) {}

  @Roles(Role.USER)
  @Post()
  async createFromCart(@CurrentUser() user: CurrentUserPayload): Promise<{ data: { orderId: string } }> {
    const result = await this.orderService.createFromCart(user.sub);
    return { data: result };
  }

  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListOrdersQueryDto,
  ) {
    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 20;
    const status = query.status;

    if (user.role === Role.COOK && user.cookId) {
      const result = await this.orderService.listForCook(user.cookId, page, limit, status);
      return { data: result.items, meta: result.meta };
    }

    const result = await this.orderService.listForUser(user.sub, page, limit, status);
    return { data: result.items, meta: result.meta };
  }

  @Get(':id')
  async getById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const order = await this.orderService.getOrderById(id, user.sub, user.role, user.cookId);
    return { data: order };
  }

  @Roles(Role.COOK)
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const updated = await this.orderService.updateStatus(id, user.cookId!, body.status);
    // this.orderGateway.notifyStatusChange(id, { orderId: id, status: updated.status });
    return { data: updated };
  }

  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const updated = await this.orderService.cancel(id, user.sub, user.role, user.cookId);
    // this.orderGateway.notifyStatusChange(id, { orderId: id, status: updated.status });
    return { data: updated };
  }
}

