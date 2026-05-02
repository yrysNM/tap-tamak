import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role, User } from '@prisma/client';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { Roles } from '../../core/auth/decorators/roles.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { MenusService } from './menus.service';
import { CreateMenuDto } from './dto/create-menu.dto';
import { ListMenuHistoryQueryDto } from './dto/list-menu-history-query.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';

@ApiTags('menus')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('menus')
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Roles(Role.COOK)
  @Get('today') 
  @ApiOperation({ summary: "Get this cook's menu for today (UTC date)" })
  async getToday(@CurrentUser() user: User) {
    return this.menusService.getTodayForCook(user.id);
  }

  @Roles(Role.COOK)
  @Get('history')
  @ApiOperation({
    summary: 'My menu history',
    description:
      'Paginated menus for this cook with `date` between `from` and `to` (inclusive), UTC calendar dates.',
  })
  async history(
    @CurrentUser() user: User,
    @Query() query: ListMenuHistoryQueryDto,
  ) {
    const result = await this.menusService.listHistoryForCook(user.id, {
      from: query.from,
      to: query.to,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    return { items: result.items, meta: result.meta };
  }

  @Roles(Role.COOK)
  @Post()
  @ApiOperation({
    summary: 'Create a menu for a calendar day',
    description:
      'Attaches dishes to the menu. Returns 409 if a menu already exists for that date.',
  })
  async create(@CurrentUser() user: User, @Body() dto: CreateMenuDto) {
    return this.menusService.createForCook(user.id, dto);
  }

  @Roles(Role.COOK)
  @Patch(':id')
  @ApiOperation({ summary: 'Edit one of my menus' })
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateMenuDto,
  ) {
    return this.menusService.updateForCook(user.id, id, dto);
  }

  @Roles(Role.COOK)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete one of my menus' })
  async remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.menusService.deleteForCook(user.id, id);
  }

  @Roles(Role.COOK)
  @Get(':id')
  @ApiOperation({ summary: 'Get one of my menus by id' })
  @ApiParam({ name: 'id', example: 'a4f67a63-0cf7-4d32-a35d-0a454b3e39f0' })
  async getById(@CurrentUser() user: User, @Param('id') id: string) {
    return this.menusService.getByIdForCook(user.id, id);
  }
}
