import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiError } from '../../common/errors/api-error.js';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const requestId = String(response.locals.requestId ?? 'unknown');
    const status =
      exception instanceof ApiError
        ? exception.status
        : exception instanceof HttpException
          ? exception.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;
    const code =
      exception instanceof ApiError
        ? exception.code
        : status >= 500
          ? 'INTERNAL_ERROR'
          : 'REQUEST_REJECTED';
    const clientMessage = resolveClientMessage(exception, status);
    const details =
      exception instanceof ApiError ? exception.details : undefined;
    const internalMessage = resolveInternalMessage(exception);

    response.locals.errorCode = code;
    response.locals.errorMessage = clientMessage;

    if (status >= 500) {
      this.logger.error(
        `Unhandled exception ${request.method} ${request.path} status=${status} code=${code} requestId=${requestId} error="${internalMessage}"`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      error: {
        code,
        message: clientMessage,
        requestId,
        path: request.path,
        ...(details ? { details } : {}),
      },
    });
  }
}

function resolveClientMessage(exception: unknown, status: number): string {
  if (status >= 500) {
    return 'An unexpected error occurred';
  }

  return resolveInternalMessage(exception) || 'Request failed';
}

function resolveInternalMessage(exception: unknown): string {
  if (exception instanceof ApiError) {
    return exception.message;
  }

  if (exception instanceof HttpException) {
    const body = exception.getResponse();
    if (typeof body === 'string' && body.trim().length > 0) {
      return body;
    }
    if (typeof body === 'object' && body !== null) {
      const message = (body as { message?: unknown }).message;
      if (Array.isArray(message)) {
        const joined = message
          .filter((item): item is string => typeof item === 'string')
          .join('; ');
        if (joined.length > 0) return joined;
      }
      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }
    }
    if (exception.message.trim().length > 0) {
      return exception.message;
    }
  }

  if (exception instanceof Error && exception.message.trim().length > 0) {
    return exception.message;
  }

  return 'Request failed';
}
