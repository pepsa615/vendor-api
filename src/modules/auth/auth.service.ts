import {
  ConflictException,
  Injectable,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { argon2id, argon2Verify } from 'hash-wasm';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../core/database/prisma.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import {
  normalizeEmail,
  randomToken,
  sha256,
  verificationCode,
} from '../../common/security/crypto.js';
import { IamTokenVerifier } from '../../integrations/iam/iam-token-verifier.js';
import type {
  ChangePasswordDto,
  CompleteInvitationDto,
  LoginDto,
  RegisterDto,
  VerifyEmailDto,
} from './auth.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: PrismaService,
    private readonly tokens: IamTokenVerifier,
    private readonly audit: AuditService,
  ) {}

  async register(input: RegisterDto) {
    const normalizedEmail = normalizeEmail(input.email);
    if (await this.db.user.findUnique({ where: { normalizedEmail } }))
      throw new ConflictException('An account already exists for this email');
    const passwordHash = await this.hashPassword(input.password);
    const code = verificationCode();
    const result = await this.db.$transaction(
      async (tx) => {
        const vendor = await tx.vendor.create({
          data: {
            type: input.vendorType,
            businessName: input.displayName.trim(),
            email: normalizedEmail,
            phone: input.phone.trim(),
          },
        });
        const user = await tx.user.create({
          data: {
            tenantId: vendor.id,
            email: normalizedEmail,
            normalizedEmail,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            phone: input.phone.trim(),
            passwordHash,
          },
        });
        const ownerRole = await tx.role.create({
          data: {
            tenantId: vendor.id,
            name: 'Owner',
            isOwner: true,
            permissions: ['*'],
          },
        });
        await tx.userRole.create({
          data: { userId: user.id, roleId: ownerRole.id },
        });
        await tx.authChallenge.create({
          data: {
            userId: user.id,
            type: 'EMAIL_VERIFICATION',
            tokenHash: sha256(`${normalizedEmail}:${code}`),
            expiresAt: new Date(Date.now() + 15 * 60_000),
          },
        });
        await tx.emailOutbox.create({
          data: {
            recipient: normalizedEmail,
            template: 'verify-email',
            payload: { code },
          },
        });
        return { vendorId: vendor.id, email: normalizedEmail };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await this.audit.record({
      tenantId: result.vendorId,
      actorId: 'public',
      action: 'auth.registered',
    });
    return { email: result.email, status: 'EMAIL_PENDING' };
  }

  async verifyEmail(input: VerifyEmailDto) {
    const normalizedEmail = normalizeEmail(input.email);
    const user = await this.db.user.findUnique({ where: { normalizedEmail } });
    if (!user)
      throw new UnauthorizedException('Invalid or expired verification code');
    const challenge = await this.db.authChallenge.findFirst({
      where: { userId: user.id, type: 'EMAIL_VERIFICATION', consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (
      !challenge ||
      challenge.expiresAt <= new Date() ||
      challenge.attempts >= 5
    )
      throw new UnauthorizedException('Invalid or expired verification code');
    if (challenge.tokenHash !== sha256(`${normalizedEmail}:${input.code}`)) {
      await this.db.authChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid or expired verification code');
    }
    await this.db.$transaction(async (tx) => {
      await tx.authChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
      });
      await tx.vendor.update({
        where: { id: user.tenantId },
        data: { status: 'IN_PROGRESS' },
      });
      const existing = await tx.onboardingApplication.findUnique({
        where: { tenantId_version: { tenantId: user.tenantId, version: 1 } },
      });
      if (!existing)
        await tx.onboardingApplication.create({
          data: { tenantId: user.tenantId, createdById: user.id },
        });
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      action: 'auth.email_verified',
    });
    return { status: 'IN_PROGRESS' };
  }

  async resend(email: string) {
    const normalizedEmail = normalizeEmail(email);
    const user = await this.db.user.findUnique({ where: { normalizedEmail } });
    if (!user || user.emailVerifiedAt) return { accepted: true };
    const recent = await this.db.authChallenge.count({
      where: {
        userId: user.id,
        type: 'EMAIL_VERIFICATION',
        createdAt: { gt: new Date(Date.now() - 10 * 60_000) },
      },
    });
    if (recent >= 3)
      throw new HttpException(
        'Please wait before requesting another code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const code = verificationCode();
    await this.db.$transaction([
      this.db.authChallenge.create({
        data: {
          userId: user.id,
          type: 'EMAIL_VERIFICATION',
          tokenHash: sha256(`${normalizedEmail}:${code}`),
          expiresAt: new Date(Date.now() + 15 * 60_000),
        },
      }),
      this.db.emailOutbox.create({
        data: {
          recipient: normalizedEmail,
          template: 'verify-email',
          payload: { code },
        },
      }),
    ]);
    return { accepted: true };
  }

  async login(input: LoginDto) {
    const user = await this.db.user.findUnique({
      where: { normalizedEmail: normalizeEmail(input.email) },
      include: { vendor: true, roleAssignments: { include: { role: true } } },
    });
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !(await argon2Verify({
        hash: user.passwordHash,
        password: input.password,
      }))
    )
      throw new UnauthorizedException('Invalid email or password');
    const permissions = [
      ...new Set(user.roleAssignments.flatMap(({ role }) => role.permissions)),
    ];
    const refreshToken = randomToken(48);
    await this.db.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    const accessToken = await this.tokens.sign({
      actorId: user.id,
      tenantId: user.tenantId,
      permissions,
      tokenVersion: user.tokenVersion,
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      action: 'auth.login',
    });
    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
      user: this.context(user, permissions),
    };
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw new UnauthorizedException('Session expired');
    const hash = sha256(refreshToken);
    const session = await this.db.session.findUnique({
      where: { refreshTokenHash: hash },
      include: {
        user: {
          include: {
            vendor: true,
            roleAssignments: { include: { role: true } },
          },
        },
      },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE'
    ) {
      if (session)
        await this.db.session.updateMany({
          where: { userId: session.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      throw new UnauthorizedException('Session expired');
    }
    const replacement = randomToken(48);
    const next = await this.db.session.create({
      data: {
        userId: session.userId,
        refreshTokenHash: sha256(replacement),
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    await this.db.session.update({
      where: { id: session.id },
      data: {
        revokedAt: new Date(),
        replacedById: next.id,
        lastUsedAt: new Date(),
      },
    });
    const permissions = [
      ...new Set(
        session.user.roleAssignments.flatMap(({ role }) => role.permissions),
      ),
    ];
    return {
      accessToken: await this.tokens.sign({
        actorId: session.user.id,
        tenantId: session.user.tenantId,
        permissions,
        tokenVersion: session.user.tokenVersion,
      }),
      refreshToken: replacement,
      expiresIn: 900,
      user: this.context(session.user, permissions),
    };
  }

  async logout(refreshToken: string | undefined) {
    if (refreshToken)
      await this.db.session.updateMany({
        where: { refreshTokenHash: sha256(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
  }

  async me(actorId: string) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: actorId },
      include: { vendor: true, roleAssignments: { include: { role: true } } },
    });
    return this.context(user, [
      ...new Set(user.roleAssignments.flatMap(({ role }) => role.permissions)),
    ]);
  }

  async changePassword(actorId: string, input: ChangePasswordDto) {
    const user = await this.db.user.findUnique({ where: { id: actorId } });
    if (
      !user ||
      !(await argon2Verify({
        hash: user.passwordHash,
        password: input.currentPassword,
      }))
    )
      throw new UnauthorizedException('Current password is incorrect');
    if (input.currentPassword === input.newPassword)
      throw new ConflictException('New password must be different');
    await this.db.$transaction([
      this.db.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await this.hashPassword(input.newPassword),
          tokenVersion: { increment: 1 },
        },
      }),
      this.db.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      action: 'auth.password_changed',
    });
    return { changed: true };
  }

  async completeInvitation(input: CompleteInvitationDto) {
    const invitation = await this.db.invitation.findUnique({
      where: { tokenHash: sha256(input.token) },
      include: { vendor: true },
    });
    if (
      !invitation ||
      invitation.status !== 'PENDING' ||
      invitation.expiresAt <= new Date()
    )
      throw new UnauthorizedException('Invitation is invalid or expired');
    if (
      await this.db.user.findUnique({
        where: { normalizedEmail: invitation.normalizedEmail },
      })
    )
      throw new ConflictException('An account already exists for this email');
    const passwordHash = await this.hashPassword(input.password);
    const user = await this.db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          tenantId: invitation.tenantId,
          email: invitation.email,
          normalizedEmail: invitation.normalizedEmail,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          passwordHash,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        },
      });
      await tx.userRole.create({
        data: { userId: created.id, roleId: invitation.roleId },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      return created;
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      action: 'staff.invitation_accepted',
      subjectId: invitation.id,
    });
    return { accepted: true };
  }

  private context(
    user: {
      id: string;
      tenantId: string;
      email: string;
      firstName: string;
      lastName: string;
      vendor: {
        id: string;
        businessName: string;
        type: string;
        status: string;
      };
    },
    permissions: string[],
  ) {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      permissions,
      vendor: user.vendor,
    };
  }
  private hashPassword(password: string) {
    return argon2id({
      password,
      salt: randomBytes(16),
      parallelism: 1,
      iterations: 2,
      memorySize: 19_456,
      hashLength: 32,
      outputType: 'encoded',
    });
  }
}
