import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export class RequestLoggingMiddleware {
  private readonly logger = new Logger('HTTP');

  use = (request: Request, response: Response, next: NextFunction): void => {
    const startedAt = Date.now();
    const { method, originalUrl } = request;
    const requestId = () => String(response.locals.requestId ?? 'unknown');

    this.logger.log(`→ ${method} ${originalUrl} requestId=${requestId()}`);

    response.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const status = response.statusCode;
      const errorMessage =
        typeof response.locals.errorMessage === 'string'
          ? response.locals.errorMessage
          : undefined;
      const errorCode =
        typeof response.locals.errorCode === 'string'
          ? response.locals.errorCode
          : undefined;

      const base = `← ${method} ${originalUrl} ${status} ${durationMs}ms requestId=${requestId()}`;
      if (status >= 400) {
        const detail = [
          errorCode ? `code=${errorCode}` : undefined,
          errorMessage ? `error="${errorMessage}"` : undefined,
        ]
          .filter(Boolean)
          .join(' ');
        const line = detail ? `${base} ${detail}` : base;
        if (status >= 500) this.logger.error(line);
        else this.logger.warn(line);
        return;
      }

      this.logger.log(base);
    });

    next();
  };
}
