import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, User } from '@prisma/client';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { Roles } from '../../core/auth/decorators/roles.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { ModerationService } from './moderation.service';
import { ListCrmReportsQueryDto } from './dto/list-crm-reports-query.dto';
import { ResolveContentReportDto } from './dto/resolve-report.dto';

@ApiTags('crm-moderation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('crm/moderation')
export class CrmModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get('reports')
  @ApiOperation({
    summary: 'List content reports for CRM moderation queue',
    description:
      'Pending reports older than 24 hours are flagged with `isOverdue: true`.',
  })
  listReports(@Query() query: ListCrmReportsQueryDto) {
    return this.moderationService.listReportsForCrm({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      overdueOnly: query.overdueOnly,
    });
  }

  @Patch('reports/:id')
  @ApiOperation({
    summary: 'Resolve or dismiss a content report',
    description:
      'Optional moderation action: DEACTIVATE_USER, HIDE_DISH, REJECT_COOK.',
  })
  resolveReport(
    @CurrentUser() admin: User,
    @Param('id') reportId: string,
    @Body() dto: ResolveContentReportDto,
  ) {
    return this.moderationService.resolveReport(reportId, admin.id, dto);
  }
}
