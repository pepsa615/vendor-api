import { Injectable, UnauthorizedException } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';
import {
  exportJWK,
  importPKCS8,
  importSPKI,
  jwtVerify,
  SignJWT,
  type JWK,
} from 'jose';
import type { AuthenticatedActor } from './authenticated-actor.js';

type TokenActor = AuthenticatedActor & { tokenVersion: number };

@Injectable()
export class IamTokenVerifier {
  private privateKey?: CryptoKey;
  private publicKey?: CryptoKey;
  private publicJwk?: JWK;

  private async keys() {
    if (this.privateKey && this.publicKey) return;
    let privatePem = process.env.AUTH_PRIVATE_KEY_PEM?.replaceAll('\\n', '\n');
    let publicPem = process.env.AUTH_PUBLIC_KEY_PEM?.replaceAll('\\n', '\n');
    if (!privatePem || !publicPem) {
      if (process.env.NODE_ENV === 'production')
        throw new Error(
          'AUTH_PRIVATE_KEY_PEM and AUTH_PUBLIC_KEY_PEM are required',
        );
      const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
      privatePem = pair.privateKey
        .export({ type: 'pkcs8', format: 'pem' })
        .toString();
      publicPem = pair.publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString();
    }
    this.privateKey = await importPKCS8(privatePem, 'RS256');
    this.publicKey = await importSPKI(publicPem, 'RS256');
    this.publicJwk = {
      ...(await exportJWK(this.publicKey)),
      kid: 'vendor-main',
      use: 'sig',
    };
  }

  async sign(actor: TokenActor): Promise<string> {
    await this.keys();
    return new SignJWT({
      tenant_id: actor.tenantId,
      permissions: actor.permissions,
      token_version: actor.tokenVersion,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'vendor-main' })
      .setSubject(actor.actorId)
      .setIssuer(process.env.AUTH_ISSUER ?? 'pepsa-vendor')
      .setAudience(process.env.AUTH_AUDIENCE ?? 'pepsa-vendor-api')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(this.privateKey!);
  }

  async verify(token: string): Promise<AuthenticatedActor> {
    await this.keys();
    const { payload } = await jwtVerify(token, this.publicKey!, {
      issuer: process.env.AUTH_ISSUER ?? 'pepsa-vendor',
      audience: process.env.AUTH_AUDIENCE ?? 'pepsa-vendor-api',
    }).catch(() => {
      throw new UnauthorizedException('Invalid access token');
    });
    if (!payload.sub || typeof payload.tenant_id !== 'string')
      throw new UnauthorizedException('Required claims missing');
    return {
      actorId: payload.sub,
      tenantId: payload.tenant_id,
      permissions: Array.isArray(payload.permissions)
        ? payload.permissions.filter((p): p is string => typeof p === 'string')
        : [],
      tokenVersion:
        typeof payload.token_version === 'number'
          ? payload.token_version
          : undefined,
    };
  }

  async jwks(): Promise<{ keys: JWK[] }> {
    await this.keys();
    return { keys: [this.publicJwk!] };
  }
}
