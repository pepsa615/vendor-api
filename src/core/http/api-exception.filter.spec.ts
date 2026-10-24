import {
  BadRequestException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../common/errors/api-error.js';
import { ApiExceptionFilter } from './api-exception.filter.js';

function createHost(path = '/api/v1/example') {
  const response = {
    locals: { requestId: 'req-test-1' } as Record<string, unknown>,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const request = {
    method: 'POST',
    path,
  };
  return {
    response,
    host: {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    },
  };
}

describe('ApiExceptionFilter', () => {
  it('returns a clear message for ApiError failures', () => {
    const filter = new ApiExceptionFilter();
    const { host, response } = createHost();

    filter.catch(
      new ApiError('VENDOR_NOT_FOUND', 'Vendor account was not found', 404, {
        vendorId: 'v1',
      }),
      host as never,
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'VENDOR_NOT_FOUND',
        message: 'Vendor account was not found',
        requestId: 'req-test-1',
        path: '/api/v1/example',
        details: { vendorId: 'v1' },
      },
    });
    expect(response.locals.errorMessage).toBe('Vendor account was not found');
    expect(response.locals.errorCode).toBe('VENDOR_NOT_FOUND');
  });

  it('joins validation messages from HttpException responses', () => {
    const filter = new ApiExceptionFilter();
    const { host, response } = createHost();

    filter.catch(
      new BadRequestException({
        message: ['email must be an email', 'password is too short'],
        error: 'Bad Request',
        statusCode: 400,
      }),
      host as never,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'REQUEST_REJECTED',
        message: 'email must be an email; password is too short',
        requestId: 'req-test-1',
        path: '/api/v1/example',
      },
    });
  });

  it('hides internal details from 5xx client responses', () => {
    const filter = new ApiExceptionFilter();
    const { host, response } = createHost();

    filter.catch(
      new InternalServerErrorException('database connection refused'),
      host as never,
    );

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId: 'req-test-1',
        path: '/api/v1/example',
      },
    });
    expect(response.locals.errorMessage).toBe('An unexpected error occurred');
  });
});
