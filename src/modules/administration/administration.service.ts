import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { isPermission } from '../../common/security/permissions.js';
import {
  normalizeEmail,
  randomToken,
  sha256,
} from '../../common/security/crypto.js';
import type {
  CreateRoleDto,
  InviteStaffDto,
  UpdateProfileDto,
} from './administration.dto.js';
import { DocumentStorageService } from '../../integrations/storage/document-storage.service.js';

@Injectable()
export class AdministrationService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: DocumentStorageService,
  ) {}

  async profile(tenantId: string) {
    const profile = await this.db.vendor.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        id: true,
        type: true,
        status: true,
        businessName: true,
        email: true,
        phone: true,
        tagline: true,
        description: true,
        logoObjectKey: true,
        rejectionNotes: true,
        publicSlug: true,
        paymentProvisioning: true,
        externalCheckoutUserId: true,
        paymentWalletId: true,
        pricingSettings: {
          where: { active: true },
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, tiers: { select: { id: true } } },
        },
      },
    });
    let logoUrl: string | null = null;
    if (profile.logoObjectKey) {
      try {
        logoUrl = await this.storage.signedDownload(profile.logoObjectKey);
      } catch {
        logoUrl = null;
      }
    }
    const blockers: string[] = [];
    if (profile.status !== 'APPROVED') blockers.push('VENDOR_NOT_APPROVED');
    if (profile.pricingSettings[0]?.tiers.length !== 4)
      blockers.push('PRICING_NOT_CONFIGURED');
    if (
      profile.paymentProvisioning !== 'ACTIVE' ||
      !profile.externalCheckoutUserId ||
      !profile.paymentWalletId
    )
      blockers.push('PAYMENT_NOT_READY');
    const {
      logoObjectKey: _,
      paymentProvisioning: _paymentProvisioning,
      externalCheckoutUserId: _externalCheckoutUserId,
      paymentWalletId: _paymentWalletId,
      pricingSettings: _pricingSettings,
      publicSlug,
      ...safe
    } = profile;
    return {
      ...safe,
      logoUrl,
      publicOrder: {
        publicSlug,
        path: `/order/${encodeURIComponent(publicSlug)}`,
        enabled: blockers.length === 0,
        blockers,
      },
    };
  }
  async updateProfile(
    tenantId: string,
    actorId: string,
    input: UpdateProfileDto,
  ) {
    const profile = await this.db.vendor.update({
      where: { id: tenantId },
      data: input,
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'vendor.profile_updated',
      subjectId: tenantId,
      metadata: { fields: Object.keys(input) },
    });
    return profile;
  }

  async uploadLogo(
    tenantId: string,
    actorId: string,
    file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Logo file is required');
    if (!['image/jpeg', 'image/png'].includes(file.mimetype))
      throw new UnsupportedMediaTypeException(
        'Logo must be a JPG or PNG image',
      );
    const stored = await this.storage.store(tenantId, file);
    await this.db.vendor.update({
      where: { id: tenantId },
      data: { logoObjectKey: stored.objectKey },
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'vendor.logo_updated',
      subjectId: tenantId,
    });
    return { uploaded: true };
  }

  roles(tenantId: string) {
    return this.db.role.findMany({
      where: { tenantId },
      orderBy: [{ isOwner: 'desc' }, { name: 'asc' }],
    });
  }
  async createRole(tenantId: string, actorId: string, input: CreateRoleDto) {
    this.validatePermissions(input.permissions);
    const role = await this.db.role.create({
      data: {
        tenantId,
        name: input.name.trim(),
        description: input.description,
        permissions: input.permissions,
      },
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'role.created',
      subjectId: role.id,
      metadata: { permissions: input.permissions },
    });
    return role;
  }
  async updateRole(
    tenantId: string,
    actorId: string,
    roleId: string,
    input: CreateRoleDto,
  ) {
    this.validatePermissions(input.permissions);
    const role = await this.db.role.findFirst({
      where: { id: roleId, tenantId },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isOwner)
      throw new ConflictException('Owner role cannot be changed');
    const updated = await this.db.role.update({
      where: { id: role.id },
      data: {
        name: input.name.trim(),
        description: input.description,
        permissions: input.permissions,
      },
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'role.updated',
      subjectId: role.id,
      metadata: { permissions: input.permissions },
    });
    return updated;
  }
  async deleteRole(tenantId: string, actorId: string, roleId: string) {
    const role = await this.db.role.findFirst({
      where: { id: roleId, tenantId },
      include: { _count: { select: { assignments: true, invitations: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isOwner || role._count.assignments || role._count.invitations)
      throw new ConflictException('Role is protected or in use');
    await this.db.role.delete({ where: { id: role.id } });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'role.deleted',
      subjectId: role.id,
    });
  }

  staff(tenantId: string) {
    return this.db.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        createdAt: true,
        roleAssignments: {
          select: { role: { select: { id: true, name: true, isOwner: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
  async invite(tenantId: string, actorId: string, input: InviteStaffDto) {
    const role = await this.db.role.findFirst({
      where: { id: input.roleId, tenantId, isOwner: false },
    });
    if (!role) throw new BadRequestException('Assignable role not found');
    const normalizedEmail = normalizeEmail(input.email);
    if (await this.db.user.findUnique({ where: { normalizedEmail } }))
      throw new ConflictException('A user already exists for this email');
    const rawToken = randomToken(32);
    const invitation = await this.db.$transaction(async (tx) => {
      await tx.invitation.updateMany({
        where: { tenantId, normalizedEmail, status: 'PENDING' },
        data: { status: 'REVOKED' },
      });
      const created = await tx.invitation.create({
        data: {
          tenantId,
          roleId: role.id,
          invitedById: actorId,
          email: normalizedEmail,
          normalizedEmail,
          tokenHash: sha256(rawToken),
          expiresAt: new Date(Date.now() + 72 * 3_600_000),
        },
      });
      await tx.emailOutbox.create({
        data: {
          recipient: normalizedEmail,
          template: 'staff-invitation',
          payload: { token: rawToken, vendorId: tenantId },
        },
      });
      return created;
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'staff.invited',
      subjectId: invitation.id,
      metadata: { email: normalizedEmail, roleId: role.id },
    });
    return {
      id: invitation.id,
      email: normalizedEmail,
      roleId: role.id,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    };
  }
  async disable(tenantId: string, actorId: string, userId: string) {
    const user = await this.db.user.findFirst({
      where: { id: userId, tenantId },
      include: { roleAssignments: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('Staff member not found');
    if (user.roleAssignments.some(({ role }) => role.isOwner))
      throw new ConflictException('Owner cannot be disabled');
    await this.db.$transaction([
      this.db.user.update({
        where: { id: user.id },
        data: { status: 'DISABLED', tokenVersion: { increment: 1 } },
      }),
      this.db.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      tenantId,
      actorId,
      action: 'staff.disabled',
      subjectId: user.id,
    });
    return { disabled: true };
  }
  audits(tenantId: string) {
    return this.db.auditEvent.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  private validatePermissions(values: string[]) {
    if (values.some((value) => !isPermission(value)))
      throw new BadRequestException('Role contains an unsupported permission');
  }
}
