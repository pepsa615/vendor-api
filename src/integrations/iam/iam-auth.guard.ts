import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { IamTokenVerifier } from './iam-token-verifier.js';
import { PrismaService } from '../../core/database/prisma.service.js';
@Injectable()
export class IamAuthGuard implements CanActivate {
  constructor(
    private readonly verifier: IamTokenVerifier,
    private readonly db: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { actor?: unknown }>();
    const [scheme, token] = request.header('authorization')?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token)
      throw new UnauthorizedException('Bearer token required');
    const actor = await this.verifier.verify(token);
    const user = await this.db.user.findFirst({
      where: { id: actor.actorId, tenantId: actor.tenantId },
      select: { status: true, tokenVersion: true },
    });
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      user.tokenVersion !== actor.tokenVersion
    )
      throw new UnauthorizedException('Session is no longer active');
    request.actor = actor;
    return true;
  }
}
