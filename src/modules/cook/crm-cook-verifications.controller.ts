import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { Roles } from '../../core/auth/decorators/roles.decorator';
import { CookVerificationService } from './cook-verification.service';
import { ListCookVerificationsQueryDto } from './dto/list-cook-verifications-query.dto';
import { PatchCookVerificationStatusDto } from './dto/patch-cook-verification-status.dto';

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('crm/cooks/verifications')
export class CrmCookVerificationsController {
  constructor(
    private readonly cookVerificationService: CookVerificationService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List cooks and verification documents (paginated)',
    description:
      'Filter by `verificationStatus` on the cook (PENDING, UNDER_REVIEW, APPROVED, REJECTED).',
  })
  async list(@Query() query: ListCookVerificationsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const result = await this.cookVerificationService.findManyForCrm({
      page,
      limit,
      status: query.status,
    });
    return { items: result.items, meta: result.meta };
  }

  @Get(':cookId')
  @ApiOperation({ summary: 'Get one cook verification details' })
  async getByCookId(@Param('cookId') cookId: string) {
    return this.cookVerificationService.findOneForCrm(cookId);
  }

  @Patch(':cookId/status')
  @ApiOperation({
    summary: 'Update cook verification status (admin)',
    description:
      'Sets the cook’s `verificationStatus`. When `status` is `REJECTED`, `rejectionReason` is required (stored on the verification record). For other statuses, `rejectionReason` is cleared.',
  })
  @ApiParam({ name: 'cookId', description: 'Cook id' })
  @ApiBody({ type: PatchCookVerificationStatusDto })
  async patchStatus(
    @Param('cookId') cookId: string,
    @Body() body: PatchCookVerificationStatusDto,
  ) {
    return this.cookVerificationService.updateStatusByAdmin(
      cookId,
      body.status,
      body.rejectionReason,
    );
  }
}
