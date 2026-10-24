import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedActor } from './authenticated-actor.js';
import { REQUIRED_PERMISSION } from './require-permission.decorator.js';
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<
      string | readonly string[]
    >(REQUIRED_PERMISSION, [context.getHandler(), context.getClass()]);
    if (!required) return true;
    const actor = context
      .switchToHttp()
      .getRequest<Request & { actor?: AuthenticatedActor }>().actor;
    if (
      !actor ||
      (!actor.permissions.includes('*') &&
        !(Array.isArray(required)
          ? required.some((permission) =>
              actor.permissions.includes(permission),
            )
          : actor.permissions.includes(required as string)))
    )
      throw new ForbiddenException('Permission denied');
    return true;
  }
}
