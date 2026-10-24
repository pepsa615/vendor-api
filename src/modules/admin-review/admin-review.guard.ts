import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jwtVerify } from 'jose';
import type { Request } from 'express';
import { ADMIN_PERMISSION_KEY } from './admin-permission.decorator.js';
import { PrismaService } from '../../core/database/prisma.service.js';
export interface AdminActor {
  actorId: string;
  permissions: string[];
  requestId?: string;
  mfaVerified: boolean;
  approvalId?: string;
  vendorIds?: string[];
}
@Injectable()
export class AdminReviewGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { adminActor?: AdminActor }>();
    const token = request.header('authorization')?.match(/^Bearer (.+)$/)?.[1];
    const secret = process.env.ADMIN_CONTROL_PLANE_SIGNING_SECRET;
    if (!token || !secret)
      throw new UnauthorizedException('Admin service authentication required');
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      {
        algorithms: ['HS256'],
        issuer: process.env.ADMIN_CONTROL_PLANE_ISSUER ?? 'pepsa-admin',
        audience:
          process.env.ADMIN_CONTROL_PLANE_AUDIENCE ?? 'pepsa-vendor-admin',
        maxTokenAge: '60s',
      },
    ).catch(() => {
      throw new UnauthorizedException('Invalid admin service token');
    });
    const permissions = Array.isArray(payload.permissions)
      ? payload.permissions.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    if (!payload.sub) throw new UnauthorizedException('Admin actor missing');
    if (payload.platform !== 'vendor')
      throw new UnauthorizedException('Admin platform claim is invalid');
    const expectedEnvironment =
      process.env.DEPLOYMENT_ENVIRONMENT ?? 'production';
    if (payload.environment !== expectedEnvironment)
      throw new UnauthorizedException('Admin environment claim is invalid');
    if (typeof payload.jti !== 'string' || typeof payload.exp !== 'number')
      throw new UnauthorizedException('Admin token replay identifier missing');
    await this.db.internalAdminActorNonce.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    const inserted = await this.db.internalAdminActorNonce.createMany({
      data: { jti: payload.jti, expiresAt: new Date(payload.exp * 1_000) },
      skipDuplicates: true,
    });
    if (inserted.count !== 1)
      throw new UnauthorizedException('Admin token was already used');
    const required = this.reflector.getAllAndOverride<string>(
      ADMIN_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (required && payload.sub !== 'system' && !permissions.includes(required))
      throw new ForbiddenException(`${required} permission required`);
    request.adminActor = {
      actorId: payload.sub,
      permissions,
      requestId:
        typeof payload.requestId === 'string' ? payload.requestId : undefined,
      mfaVerified: payload.mfaVerified === true,
      approvalId:
        typeof payload.approvalId === 'string' ? payload.approvalId : undefined,
      vendorIds:
        payload.resourceScopes &&
        typeof payload.resourceScopes === 'object' &&
        Array.isArray(
          (payload.resourceScopes as Record<string, unknown>).vendorIds,
        )
          ? (
              (payload.resourceScopes as Record<string, unknown>)
                .vendorIds as unknown[]
            ).filter((value): value is string => typeof value === 'string')
          : undefined,
    };
    return true;
  }
}
