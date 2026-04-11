import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class TildaWebhookSecretGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.configService.get<string>('tilda.webhookSecret');
    if (!secret) {
      return true;
    }
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['x-tilda-webhook-secret'];
    const headerVal = Array.isArray(header) ? header[0] : header;
    const auth = req.headers.authorization;
    const bearer =
      auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : null;
    if (headerVal === secret || bearer === secret) {
      return true;
    }
    throw new UnauthorizedException('Invalid webhook secret');
  }
}
