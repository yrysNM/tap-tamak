import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { Roles } from '../../core/auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { AddBasketItemDto } from './dto/add-basket-item.dto';
import { BasketService } from './basket.service';

interface CurrentUserPayload {
  sub: string;
}

@ApiTags('basket')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER)
@Controller('basket')
export class BasketController {
  constructor(private readonly basketService: BasketService) {}

  @Post('items')
  @ApiOperation({ summary: 'Add dish item to basket' })
  async addItem(@CurrentUser() user: CurrentUserPayload, @Body() dto: AddBasketItemDto) {
    return this.basketService.addItem(user.sub, dto.dishId, dto.quantity);
  }
}
