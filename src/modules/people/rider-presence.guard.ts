import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

/**
 * Accepts the shared Rider provisioning bearer token so rider-backend can
 * push presence without an IAM actor session.
 */
@Injectable()
export class RiderPresenceGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = String(request.headers.authorization ?? '');
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const supplied = match?.[1]?.trim() ?? '';
    const expected = String(
      this.config.get<string>('RIDER_PROVISIONING_API_TOKEN') ?? '',
    ).trim();
    if (!supplied || !expected || supplied.length !== expected.length) {
      throw new UnauthorizedException('Invalid rider presence credentials');
    }
    const ok = timingSafeEqual(
      Buffer.from(supplied),
      Buffer.from(expected),
    );
    if (!ok) {
      throw new UnauthorizedException('Invalid rider presence credentials');
    }
    return true;
  }
}
