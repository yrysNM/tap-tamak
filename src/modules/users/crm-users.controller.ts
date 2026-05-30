import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { Role } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express } from 'express';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { Roles } from '../../core/auth/decorators/roles.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { UsersService } from './users.service';
import { ListCrmUsersQueryDto } from './dto/list-crm-users-query.dto';
import { PatchCrmUserDto } from './dto/patch-crm-user.dto';
import { PatchCrmUserPasswordDto } from './dto/patch-crm-user-password.dto';

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('crm/users')
export class CrmUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (paginated)' })
  async list(@Query() query: ListCrmUsersQueryDto) {
    const result = await this.usersService.listForCrm(query);
    return { items: result.items, meta: result.meta };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one user' })
  async getById(@Param('id') id: string) {
    return this.usersService.findOneForCrm(id);
  }

  @Patch(':id/password')
  @ApiOperation({ summary: 'Reset user password (admin)' })
  async resetPassword(
    @Param('id') id: string,
    @Body() body: PatchCrmUserPasswordDto,
  ) {
    await this.usersService.resetPasswordForCrm(id, body.newPassword);
    return { ok: true };
  }

  @Patch(':id/profile-image')
  @ApiOperation({
    summary: 'Upload or replace user profile image',
    description:
      'Multipart field `image`: JPEG, PNG, or WebP, max 8MB. For cooks, updates cook profile image.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Profile image',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async uploadProfileImage(
    @Param('id') id: string,
    @UploadedFile() image: Express.Multer.File | undefined,
  ) {
    return this.usersService.updateProfileImageForCrm(id, image);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user profile or status' })
  async patch(
    @Param('id') id: string,
    @Body() body: PatchCrmUserDto,
    @CurrentUser() admin: User,
  ) {
    return this.usersService.updateForCrm(id, body, admin.id);
  }
}
