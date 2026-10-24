import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export class RequestContextMiddleware {
  use = (request: Request, response: Response, next: NextFunction): void => {
    const incoming = request.header('x-request-id');
    const requestId =
      incoming && /^[\w-]{1,100}$/.test(incoming) ? incoming : randomUUID();
    response.setHeader('x-request-id', requestId);
    response.locals.requestId = requestId;
    next();
  };
}
