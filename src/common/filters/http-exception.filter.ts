import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const rawResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const extracted: string | string[] | undefined =
      typeof rawResponse === 'string'
        ? rawResponse
        : rawResponse &&
            typeof rawResponse === 'object' &&
            'message' in rawResponse
          ? (rawResponse as { message?: string | string[] }).message
          : undefined;

    const messages: string[] = (() => {
      if (extracted === undefined || extracted === null) {
        return ['An error occurred'];
      }
      if (Array.isArray(extracted)) {
        const list = extracted.map(String).filter(Boolean);
        return list.length > 0 ? list : ['An error occurred'];
      }
      const single = String(extracted);
      return single ? [single] : ['An error occurred'];
    })();

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      data: null,
      message: messages.join('. '),
      error: messages,
    });
  }
}
