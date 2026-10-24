import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AdminReviewGuard } from './admin-review.guard.js';

const secret = 'admin-control-plane-test-secret-32-bytes';

async function token(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    platform: 'vendor',
    environment: 'test',
    permissions: ['vendor.businesses.read'],
    requestId: 'request-1',
    ...overrides,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('pepsa-admin')
    .setAudience('pepsa-vendor-admin')
    .setSubject('actor-1')
    .setJti(String(overrides.jti ?? randomUUID()))
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(new TextEncoder().encode(secret));
}

function context(jwt: string) {
  const request: Record<string, unknown> = {
    header: (name: string) =>
      name === 'authorization' ? `Bearer ${jwt}` : undefined,
  };
  return {
    request,
    value: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    },
  };
}

describe('AdminReviewGuard trust boundary', () => {
  it('rejects a wrong platform claim', async () => {
    process.env.ADMIN_CONTROL_PLANE_SIGNING_SECRET = secret;
    process.env.DEPLOYMENT_ENVIRONMENT = 'test';
    const guard = new AdminReviewGuard(
      { getAllAndOverride: vi.fn() } as never,
      {} as never,
    );
    await expect(
      guard.canActivate(
        context(await token({ platform: 'payment' })).value as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a wrong deploy lane', async () => {
    process.env.ADMIN_CONTROL_PLANE_SIGNING_SECRET = secret;
    process.env.DEPLOYMENT_ENVIRONMENT = 'test';
    const guard = new AdminReviewGuard(
      { getAllAndOverride: vi.fn() } as never,
      {} as never,
    );
    await expect(
      guard.canActivate(
        context(await token({ environment: 'production' })).value as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects replay and missing permission', async () => {
    process.env.ADMIN_CONTROL_PLANE_SIGNING_SECRET = secret;
    process.env.DEPLOYMENT_ENVIRONMENT = 'test';
    const replayDb = {
      internalAdminActorNonce: {
        deleteMany: vi.fn(),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const replayGuard = new AdminReviewGuard(
      { getAllAndOverride: vi.fn() } as never,
      replayDb as never,
    );
    await expect(
      replayGuard.canActivate(context(await token()).value as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const permissionGuard = new AdminReviewGuard(
      {
        getAllAndOverride: vi.fn().mockReturnValue('vendor.finance.read'),
      } as never,
      {
        internalAdminActorNonce: {
          deleteMany: vi.fn(),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      } as never,
    );
    await expect(
      permissionGuard.canActivate(context(await token()).value as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
