import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { Roles } from '../../core/auth/decorators/roles.decorator';
import { CookLeadService } from './cook-lead.service';
import { ListCookLeadsQueryDto } from './dto/list-cook-leads-query.dto';
import { PatchCookLeadStatusDto } from './dto/patch-cook-lead-status.dto';

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('crm/cook-leads')
export class CrmCookLeadsController {
  constructor(private readonly cookLeadService: CookLeadService) {}

  @Get()
  @ApiOperation({ summary: 'List cook leads (paginated)' })
  async list(@Query() query: ListCookLeadsQueryDto) {
    const result = await this.cookLeadService.findManyForCms(query);
    return { data: result.items, meta: result.meta };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one cook lead' })
  async getById(@Param('id') id: string) {
    const lead = await this.cookLeadService.findOne(id);
    return { data: lead };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update cook lead status' })
  async patchStatus(
    @Param('id') id: string,
    @Body() body: PatchCookLeadStatusDto,
  ) {
    const updated = await this.cookLeadService.updateStatus(id, body.status);
    return { data: updated };
  }
}
