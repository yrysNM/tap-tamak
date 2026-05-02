import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role, User } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express } from 'express';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { Roles } from '../../core/auth/decorators/roles.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { DishesService } from './dishes.service';
import { CreateDishFormDto } from './dto/create-dish-form.dto';
import { ListDishesQueryDto } from './dto/list-dishes-query.dto';
import { UpdateDishFormDto } from './dto/update-dish-form.dto';

@ApiTags('dishes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COOK, Role.USER)
@Controller('dishes')
export class DishesController {
  constructor(private readonly dishesService: DishesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a dish (multipart: fields + image)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'name',
        'description',
        'cookingTime',
        'preparationType',
        'price',
        'image',
      ],
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        cookingTime: { type: 'integer' },
        preparationType: { type: 'string', enum: ['FAST', 'LONG'] },
        price: { type: 'integer' },
        category: { type: 'string' },
        tags: { type: 'string', description: 'Comma-separated' },
        calories: { type: 'integer' },
        isAvailable: { type: 'boolean' },
        image: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateDishFormDto,
    @UploadedFile() image: Express.Multer.File,
  ) {
    return this.dishesService.createForCook(user.id, dto, image);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit one of my dishes (multipart: fields + optional image)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        cookingTime: { type: 'integer' },
        preparationType: { type: 'string', enum: ['FAST', 'LONG'] },
        price: { type: 'integer' },
        category: { type: 'string' },
        tags: { type: 'string', description: 'Comma-separated' },
        calories: { type: 'integer' },
        isAvailable: { type: 'boolean' },
        image: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateDishFormDto,
    @UploadedFile() image: Express.Multer.File | undefined,
  ) {
    return this.dishesService.updateForCook(user.id, id, dto, image);
  }

  @Get()
  @ApiOperation({ summary: 'List my dishes' })
  async list(
    @CurrentUser() user: User,
    @Query() query: ListDishesQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return this.dishesService.listForCook(user.id, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of my dishes' })
  async getOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.dishesService.getOneForCook(user.id, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete one of my dishes' })
  async remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.dishesService.deleteForCook(user.id, id);
  }
}
