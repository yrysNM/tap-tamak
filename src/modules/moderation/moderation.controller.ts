import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { ModerationService } from './moderation.service';
import { CreateContentReportDto, CreateUserBlockDto } from './dto/create-report.dto';

@ApiTags('moderation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post('reports')
  @ApiOperation({ summary: 'Report objectionable content or user' })
  createReport(@CurrentUser() user: User, @Body() dto: CreateContentReportDto) {
    return this.moderationService.createReport(user.id, dto);
  }

  @Post('blocks')
  @ApiOperation({
    summary: 'Block an abusive user',
    description:
      'Hides the user from your feed immediately and notifies the developer via an auto-generated report.',
  })
  blockUser(@CurrentUser() user: User, @Body() dto: CreateUserBlockDto) {
    return this.moderationService.blockUser(user.id, dto);
  }

  @Get('blocks')
  @ApiOperation({ summary: 'List users blocked by the current user' })
  listBlocks(@CurrentUser() user: User) {
    return this.moderationService.listBlocks(user.id);
  }

  @Delete('blocks/:userId')
  @ApiOperation({ summary: 'Unblock a user' })
  unblockUser(
    @CurrentUser() user: User,
    @Param('userId') blockedUserId: string,
  ) {
    return this.moderationService.unblockUser(user.id, blockedUserId);
  }
}
