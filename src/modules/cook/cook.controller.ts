import {
  Controller,
  Post,
  UploadedFiles,
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
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express } from 'express';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { Roles } from '../../core/auth/decorators/roles.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { CookVerificationService } from './cook-verification.service';

@ApiTags('cooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cooks')
export class CookController {
  constructor(
    private readonly cookVerificationService: CookVerificationService,
  ) {}

  @Roles(Role.COOK)
  @Post('me/verification')
  @ApiOperation({
    summary: 'Upload verification documents (kitchen photos + PDFs)',
    description:
      'Multipart: `kitchenPhotos` (1–6 images: JPEG, PNG, WebP), `healthCert` (PDF), `certificate` (PDF). Sets verification status to UNDER_REVIEW.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['kitchenPhotos', 'healthCert', 'certificate'],
      properties: {
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
          description: 'Health certificate (PDF)',
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
    @UploadedFiles()
    files: {
      kitchenPhotos?: Express.Multer.File[];
      healthCert?: Express.Multer.File[];
      certificate?: Express.Multer.File[];
    },
  ) {
    const data = await this.cookVerificationService.submitForUser(
      user.id,
      files,
    );
    return { data };
  }
}
