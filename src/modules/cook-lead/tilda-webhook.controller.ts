import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../core/auth/decorators/public.decorator';
import { CookLeadService } from './cook-lead.service';
import { CreateCookLeadDto } from './dto/create-cook-lead.dto';
import { TildaWebhookSecretGuard } from './guards/tilda-webhook-secret.guard';

/**
 * Tilda integration:
 * - URL: POST /api/v1/webhooks/tilda/cook-leads
 * - Body: JSON or form-urlencoded with fields `email`, `fullName`, `message` (configure Tilda outputs to these keys).
 * - Optional: set env `TILDA_WEBHOOK_SECRET` and send the same value as header `x-tilda-webhook-secret` or `Authorization: Bearer <secret>`.
 * - Extra form fields are ignored (whitelist); full body is stored in `rawPayload` for debugging.
 */
@ApiTags('webhooks')
@Controller('webhooks/tilda')
export class TildaWebhookController {
  constructor(private readonly cookLeadService: CookLeadService) {}

  @Public()
  @UseGuards(TildaWebhookSecretGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  )
  @Post('cook-leads')
  @ApiOperation({
    summary: 'Ingest cook lead from Tilda',
    description:
      'Public endpoint for Tilda form webhooks. Requires `TILDA_WEBHOOK_SECRET` header when that env var is set.',
  })
  async ingest(
    @Body() dto: CreateCookLeadDto,
    @Req() req: Request,
  ): Promise<{ data: Awaited<ReturnType<CookLeadService['createFromTilda']>> }> {
    const raw =
      req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : undefined;
    const created = await this.cookLeadService.createFromTilda(dto, raw);
    return { data: created };
  }
}
