import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
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
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express } from 'express';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { Roles } from '../../core/auth/decorators/roles.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { Public } from '../../core/auth/decorators/public.decorator';
import { CookVerificationService } from './cook-verification.service';
import { CookService } from './cook.service';
import { ListCooksQueryDto } from './dto/list-cooks-query.dto';
import { SubmitCookVerificationDto } from './dto/submit-cook-verification.dto';
import { UpdateCookScheduleDto } from './dto/update-cook-schedule.dto';
import { GetCookMenuInfoQueryDto } from './dto/get-cook-menu-info-query.dto';

@ApiTags('cooks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cooks')
export class CookController {
  constructor(
    private readonly cookVerificationService: CookVerificationService,
    private readonly cookService: CookService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'List cooks (storefront)',
    description:
      'Paginated verified cooks for the client app. Optional `isAvailable`, `q` (business name contains).',
  })
  async listForClient(@Query() query: ListCooksQueryDto) {
    return this.cookService.listForClient({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      isAvailable: query.isAvailable,
      q: query.q,
    });
  }

  @Public()
  @Get(':cookId/menus-information')
  @ApiOperation({
    summary: 'Get cook profile with menu information',
    description:
      'Returns verified cook information and dishes from a menu for the requested UTC date (or today if omitted).',
  })
  async getMenuInformationForClient(
    @Param('cookId') cookId: string,
    @Query() query: GetCookMenuInfoQueryDto,
  ) {
    return this.cookService.getMenuInformationForClient(cookId, query.date);
  }

  @ApiBearerAuth()
  @Roles(Role.COOK)
  @Get('me/informations')
  @ApiOperation({
    summary: "Get cook's personal informations",
    description:
      'Returns cook profile image, phone, surname, average cooking time, and total dish count.',
  })
  async getMyInformations(@CurrentUser() user: User) {
    return this.cookService.getMyInformations(user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.COOK)
  @Get('me/schedule')
  @ApiOperation({
    summary: "Get cook's work schedule",
    description: 'Returns current UTC schedule window and computed active status.',
  })
  async getMySchedule(@CurrentUser() user: User) {
    return this.cookService.getMySchedule(user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.COOK)
  @Patch('me/schedule')
  @ApiOperation({
    summary: "Set cook's work schedule",
    description:
      'Sets UTC schedule range (`workStartAt`, `workEndAt`). Cook becomes inactive automatically after `workEndAt`.',
  })
  async updateMySchedule(@CurrentUser() user: User, @Body() dto: UpdateCookScheduleDto) {
    return this.cookService.updateMySchedule(user.id, dto.workStartAt, dto.workEndAt);
  }

  @ApiBearerAuth()
  @Roles(Role.COOK)
  @Patch('me/profile-image')
  @ApiOperation({
    summary: "Create or replace cook's profile image",
    description: 'Multipart upload with one image file in `image` field (JPEG, PNG, WebP).',
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
          description: 'Cook profile image (JPEG, PNG, or WebP)',
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
  async updateMyProfileImage(
    @CurrentUser() user: User,
    @UploadedFile() image: Express.Multer.File | undefined,
  ) {
    return this.cookService.updateMyProfileImage(user.id, image);
  }

  @ApiBearerAuth()
  @Roles(Role.COOK)
  @Get('me/verification')
  @ApiOperation({
    summary: 'Get cook verification status and submitted documents',
    description:
      'Returns `verificationStatus`, `businessName`, and `documents` (kitchen photos, PDF URLs, rejection reason if any, timestamps) or `documents: null` if nothing submitted yet.',
  })
  async getVerification(@CurrentUser() user: User) {
    return this.cookVerificationService.getStatusForUser(user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.COOK)
  @Post('me/verification')
  @ApiOperation({
    summary: 'Upload verification documents (kitchen photos + PDFs)',
    description:
      'Multipart: `kitchenPhotos` (1–6 images: JPEG, PNG, WebP), `certificate` (PDF), optional `healthCert` (PDF). Sets verification status to UNDER_REVIEW.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['kitchenPhotos', 'certificate', 'latitude', 'longitude'],
      properties: {
        latitude: {
          type: 'number',
          format: 'double',
          description: 'Cook latitude in decimal degrees',
          example: 43.238949,
        },
        longitude: {
          type: 'number',
          format: 'double',
          description: 'Cook longitude in decimal degrees',
          example: 76.889709,
        },
        kitchenPhotos: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          minItems: 1,
          maxItems: 6,
          description: '1–6 kitchen photos',
        },
        healthCert: {
          type: 'string',
          format: 'binary',
          description: 'Health certificate (PDF), optional',
        },
        certificate: {
          type: 'string',
          format: 'binary',
          description: 'Business / qualification certificate (PDF)',
        },
      },
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'kitchenPhotos', maxCount: 6 },
        { name: 'healthCert', maxCount: 1 },
        { name: 'certificate', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 16 * 1024 * 1024 },
      },
    ),
  )
  async uploadVerification(
    @CurrentUser() user: User,
    @Body() dto: SubmitCookVerificationDto,
    @UploadedFiles()
    files: {
      kitchenPhotos?: Express.Multer.File[];
      healthCert?: Express.Multer.File[];
      certificate?: Express.Multer.File[];
    },
  ) {
    return this.cookVerificationService.submitForUser(user.id, files, dto);
  }
}
