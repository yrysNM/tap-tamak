import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../../core/auth/authenticated-user';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { Roles } from '../../core/auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { AddBasketItemsDto } from './dto/add-basket-item.dto';
import { UpdateBasketItemDto } from './dto/update-basket-item.dto';
import { BasketService } from './basket.service';

@ApiTags('basket')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER)
@Controller('basket')
export class BasketController {
  constructor(private readonly basketService: BasketService) {}

  @Get()
  @ApiOperation({ summary: 'Get current basket with line totals' })
  async getCart(@CurrentUser() user: AuthenticatedUser) {
    return this.basketService.getCart(user.id);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add one or more dishes to basket' })
  async addItems(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddBasketItemsDto) {
    return this.basketService.addItems(user.id, dto.items);
  }

  @Patch('items/:cartItemId')
  @ApiOperation({ summary: 'Update basket line quantity' })
  async updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cartItemId', ParseUUIDPipe) cartItemId: string,
    @Body() dto: UpdateBasketItemDto,
  ) {
    return this.basketService.updateItemQuantity(user.id, cartItemId, dto.quantity);
  }

  @Delete('items/:cartItemId')
  @ApiOperation({ summary: 'Remove a line from the basket' })
  async removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cartItemId', ParseUUIDPipe) cartItemId: string,
  ) {
    return this.basketService.removeItem(user.id, cartItemId);
  }

  @Delete()
  @ApiOperation({ summary: 'Clear the basket' })
  async clearCart(@CurrentUser() user: AuthenticatedUser) {
    return this.basketService.clearCart(user.id);
  }
}
