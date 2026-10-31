/* oxlint-disable no-unused-vars */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { encryptSensitive, sha256 } from '../../common/security/crypto.js';
import { PrismaService } from '../../core/database/prisma.service.js';
import { DocumentStorageService } from '../../integrations/storage/document-storage.service.js';
import { RiderBackendService } from '../../integrations/rider/rider-backend.service.js';
import type {
  CreateCustomerDto,
  CreateDispatcherDto,
  PeopleListQueryDto,
  ReviewDispatcherDto,
  UpdateDispatcherDto,
} from './people.dto.js';

const requiredDocuments = [
  'PROOF_OF_ID',
  'HEADSHOT',
  'PROOF_OF_ADDRESS',
] as const;
const motorized = new Set([
  'MOTORCYCLE',
  'TRICYCLE',
  'VAN',
  'TRUCK',
  'LONG_TRUCK',
]);

@Injectable()
export class PeopleService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: DocumentStorageService,
    private readonly audit: AuditService,
    private readonly riders: RiderBackendService,
  ) {}

  async customers(tenantId: string, query: PeopleListQueryDto) {
    const where: Prisma.CustomerWhereInput = {
      tenantId,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.customer.count({ where }),
    ]);
    return {
      items: items.map((customer) => ({ ...customer, totalOrders: 0 })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async createCustomer(
    tenantId: string,
    actorId: string,
    input: CreateCustomerDto,
  ) {
    const phone = input.phone.trim();
    if (await this.db.customer.findFirst({ where: { tenantId, phone } }))
      throw new ConflictException('A customer with this phone already exists');
    const customer = await this.db.customer.create({
      data: {
        tenantId,
        name: input.name.trim(),
        phone,
        email: input.email?.trim().toLowerCase(),
      },
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'customer.created',
      subjectId: customer.id,
    });
    return { ...customer, totalOrders: 0 };
  }

  async dispatchers(tenantId: string, query: PeopleListQueryDto) {
    const status = query.status?.toUpperCase();
    const where: Prisma.DispatcherWhereInput = {
      tenantId,
      ...(status && status !== 'ALL' ? { status: status as never } : {}),
      ...(query.search
        ? {
            revisions: {
              some: {
                OR: [
                  {
                    firstName: { contains: query.search, mode: 'insensitive' },
                  },
                  { lastName: { contains: query.search, mode: 'insensitive' } },
                  { email: { contains: query.search, mode: 'insensitive' } },
                  { phone: { contains: query.search } },
                ],
              },
            },
          }
        : {}),
    };
    const [rows, total, online, active, inactive, all] =
      await this.db.$transaction([
        this.db.dispatcher.findMany({
          where,
          include: { approvedRevision: true, latestRevision: true },
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.db.dispatcher.count({ where }),
        this.db.dispatcher.count({
          where: { tenantId, status: 'APPROVED', availability: true },
        }),
        this.db.dispatcher.count({
          where: { tenantId, status: 'APPROVED', availability: false },
        }),
        this.db.dispatcher.count({
          where: { tenantId, status: { in: ['REJECTED', 'DISABLED'] } },
        }),
        this.db.dispatcher.count({ where: { tenantId } }),
      ]);
    return {
      items: rows.map((row) => this.listItem(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      stats: { online, active, inactive, total: all },
    };
  }

  async createDispatcher(
    tenantId: string,
    actorId: string,
    input: CreateDispatcherDto,
  ) {
    this.validateDispatcher(input);
    const created = await this.db.$transaction(async (tx) => {
      const dispatcher = await tx.dispatcher.create({ data: { tenantId } });
      const revision = await tx.dispatcherRevision.create({
        data: this.revisionData(dispatcher.id, 1, input),
      });
      return tx.dispatcher.update({
        where: { id: dispatcher.id },
        data: { latestRevisionId: revision.id },
        include: { latestRevision: { include: { documents: true } } },
      });
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'dispatcher.created',
      subjectId: created.id,
    });
    return this.safeDispatcher(created);
  }

  async dispatcher(tenantId: string, id: string) {
    const row = await this.db.dispatcher.findFirst({
      where: { id, tenantId },
      include: {
        approvedRevision: { include: { documents: true } },
        latestRevision: { include: { documents: true } },
      },
    });
    if (!row) throw new NotFoundException('Dispatcher not found');
    const safe = this.safeDispatcher(row);
    const phone = this.dispatcherPhone(row);
    const rider = phone ? await this.riders.lookupByPhone(phone) : null;
    return {
      ...safe,
      selfieUrl: rider?.photo ?? null,
      riderOnline: rider?.online ?? null,
      riderLocationObservedAt: rider?.locationObservedAt ?? null,
    };
  }

  async dispatcherLocation(tenantId: string, id: string) {
    const row = await this.db.dispatcher.findFirst({
      where: { id, tenantId },
      include: {
        approvedRevision: true,
        latestRevision: true,
      },
    });
    if (!row) throw new NotFoundException('Dispatcher not found');
    const phone = this.dispatcherPhone(row);
    if (!phone) return null;
    const rider = await this.riders.lookupByPhone(phone);
    if (!rider?.position) return null;
    return {
      latitude: rider.position.latitude,
      longitude: rider.position.longitude,
      observedAt: rider.locationObservedAt,
      online: rider.online,
    };
  }

  private dispatcherPhone(row: {
    approvedRevision: { phone?: string | null } | null;
    latestRevision: { phone?: string | null } | null;
  }): string | null {
    const phone =
      row.approvedRevision?.phone?.trim() ||
      row.latestRevision?.phone?.trim() ||
      '';
    return phone || null;
  }

  async updateDispatcher(
    tenantId: string,
    actorId: string,
    id: string,
    input: UpdateDispatcherDto,
  ) {
    const dispatcher = await this.db.dispatcher.findFirst({
      where: { id, tenantId },
      include: {
        latestRevision: { include: { documents: true } },
        approvedRevision: true,
      },
    });
    if (!dispatcher?.latestRevision)
      throw new NotFoundException('Dispatcher not found');
    if (dispatcher.status === 'DISABLED')
      throw new ConflictException('Disabled dispatcher cannot be changed');
    const source = dispatcher.latestRevision;
    if (source.status === 'UNDER_REVIEW')
      throw new ConflictException('Dispatcher is awaiting review');
    const merged = this.mergeRevision(source, input);
    this.validateDispatcher(merged);
    const revision =
      source.status === 'APPROVED'
        ? await this.db.dispatcherRevision.create({
            data: {
              ...this.revisionData(id, source.version + 1, merged, source),
              documents: {
                create: source.documents
                  .filter((document) => document.status === 'CLEAN')
                  .map(
                    ({ id: _, revisionId: __, createdAt: ___, ...document }) =>
                      document,
                  ),
              },
            },
          })
        : await this.db.dispatcherRevision.update({
            where: { id: source.id },
            data: {
              ...this.revisionData(id, source.version, merged, source),
              status: 'DRAFT',
              decisionReason: null,
              correctionFields: [],
              decidedAt: null,
            },
          });
    await this.db.dispatcher.update({
      where: { id },
      data: {
        latestRevisionId: revision.id,
        ...(dispatcher.approvedRevisionId ? {} : { status: 'DRAFT' }),
      },
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'dispatcher.updated',
      subjectId: id,
      metadata: { version: revision.version, fields: Object.keys(input) },
    });
    return this.dispatcher(tenantId, id);
  }

  async uploadDocument(
    tenantId: string,
    actorId: string,
    id: string,
    documentType: string,
    file: Express.Multer.File,
  ) {
    const dispatcher = await this.db.dispatcher.findFirst({
      where: { id, tenantId },
      include: { latestRevision: true },
    });
    if (!dispatcher?.latestRevision)
      throw new NotFoundException('Dispatcher not found');
    if (!['DRAFT', 'REJECTED'].includes(dispatcher.latestRevision.status))
      throw new ConflictException('Dispatcher documents are not editable');
    const stored = await this.storage.store(tenantId, file);
    const document = await this.db.dispatcherDocument.create({
      data: {
        revisionId: dispatcher.latestRevision.id,
        documentType,
        objectKey: stored.objectKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        checksum: createHash('sha256').update(file.buffer).digest('hex'),
        status: 'CLEAN',
        scanMessage: stored.scanMessage,
        scannedAt: new Date(),
      },
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'dispatcher.document_uploaded',
      subjectId: document.id,
      metadata: { dispatcherId: id, documentType },
    });
    const { objectKey: _, scanMessage: __, checksum: ___, ...safe } = document;
    return safe;
  }

  async submit(tenantId: string, actorId: string, id: string) {
    const dispatcher = await this.db.dispatcher.findFirst({
      where: { id, tenantId },
      include: { latestRevision: { include: { documents: true } } },
    });
    if (!dispatcher?.latestRevision)
      throw new NotFoundException('Dispatcher not found');
    if (!['DRAFT', 'REJECTED'].includes(dispatcher.latestRevision.status))
      throw new ConflictException('Dispatcher is not ready for submission');
    if (
      !dispatcher.latestRevision.encryptedGuarantorNin ||
      !dispatcher.latestRevision.guarantorAddress.trim()
    )
      throw new BadRequestException(
        'Guarantor NIN and address are required before submission',
      );
    const clean = new Set(
      dispatcher.latestRevision.documents
        .filter((document) => document.status === 'CLEAN')
        .map((document) => document.documentType),
    );
    const missing = requiredDocuments.filter((type) => !clean.has(type));
    if (missing.length)
      throw new BadRequestException(
        `Required documents missing: ${missing.join(', ')}`,
      );
    await this.db.$transaction([
      this.db.dispatcherRevision.update({
        where: { id: dispatcher.latestRevision.id },
        data: { status: 'UNDER_REVIEW', submittedAt: new Date() },
      }),
      this.db.dispatcher.update({
        where: { id },
        data: dispatcher.approvedRevisionId
          ? {}
          : { status: 'UNDER_REVIEW', availability: false },
      }),
    ]);
    await this.audit.record({
      tenantId,
      actorId,
      action: 'dispatcher.submitted',
      subjectId: id,
      metadata: { version: dispatcher.latestRevision.version },
    });
    return {
      status: 'UNDER_REVIEW',
      version: dispatcher.latestRevision.version,
    };
  }

  async availability(
    tenantId: string,
    actorId: string,
    id: string,
    available: boolean,
  ) {
    const dispatcher = await this.db.dispatcher.findFirst({
      where: { id, tenantId },
    });
    if (!dispatcher) throw new NotFoundException('Dispatcher not found');
    if (dispatcher.status !== 'APPROVED')
      throw new ConflictException('Only approved dispatchers can go online');
    await this.db.dispatcher.update({
      where: { id },
      data: { availability: available },
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: available ? 'dispatcher.online' : 'dispatcher.offline',
      subjectId: id,
    });
    return { available };
  }

  reviewQueue() {
    return this.db.dispatcherRevision.findMany({
      where: { status: 'UNDER_REVIEW' },
      select: {
        id: true,
        dispatcherId: true,
        version: true,
        firstName: true,
        lastName: true,
        vehicleType: true,
        submittedAt: true,
        dispatcher: {
          select: {
            tenantId: true,
            vendor: { select: { businessName: true } },
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });
  }

  async reviewDetail(revisionId: string) {
    const revision = await this.db.dispatcherRevision.findUnique({
      where: { id: revisionId },
      include: { dispatcher: true, documents: true },
    });
    if (!revision) throw new NotFoundException('Dispatcher revision not found');
    return this.safeRevision(revision);
  }

  async dispatcherTenant(dispatcherId: string) {
    const dispatcher = await this.db.dispatcher.findUnique({
      where: { id: dispatcherId },
      select: { tenantId: true },
    });
    if (!dispatcher) throw new NotFoundException('Dispatcher not found');
    return dispatcher.tenantId;
  }

  async reviewDocument(
    revisionId: string,
    documentId: string,
    actorId: string,
  ) {
    const document = await this.db.dispatcherDocument.findFirst({
      where: { id: documentId, revisionId, status: 'CLEAN' },
      include: { revision: { select: { dispatcher: true } } },
    });
    if (!document) throw new NotFoundException('Document not found');
    const url = await this.storage.signedDownload(document.objectKey);
    await this.audit.record({
      tenantId: document.revision.dispatcher.tenantId,
      actorId,
      action: 'admin.dispatcher_document_accessed',
      subjectId: document.id,
      metadata: { revisionId },
    });
    return { url, expiresIn: 60 };
  }

  async review(
    revisionId: string,
    actorId: string,
    idempotencyKey: string,
    input: ReviewDispatcherDto,
    requestId?: string,
  ) {
    if (!idempotencyKey)
      throw new ConflictException('Idempotency-Key is required');
    if (input.decision === 'REJECT' && !input.correctionFields?.length)
      throw new ConflictException(
        'Rejected revisions require correction fields',
      );
    const requestHash = sha256(JSON.stringify(input));
    const scope = `dispatcher-review:${revisionId}`;
    const existing = await this.db.idempotencyRecord.findUnique({
      where: { scope_key: { scope, key: idempotencyKey } },
    });
    if (existing) {
      if (existing.actorId !== actorId || existing.requestHash !== requestHash)
        throw new ConflictException(
          'Idempotency key was used for another request',
        );
      return existing.responseBody;
    }
    const revision = await this.db.dispatcherRevision.findUnique({
      where: { id: revisionId },
      include: { dispatcher: true },
    });
    if (!revision || revision.status !== 'UNDER_REVIEW')
      throw new ConflictException('Revision is not awaiting review');
    if (
      input.decision === 'APPROVE' &&
      (!revision.encryptedGuarantorNin || !revision.guarantorAddress.trim())
    )
      throw new ConflictException(
        'Dispatcher guarantor NIN and address must be supplied before approval',
      );
    const approved = input.decision === 'APPROVE';
    const body = {
      dispatcherId: revision.dispatcherId,
      revisionId,
      status: approved ? 'APPROVED' : 'REJECTED',
      riderProvisioningStatus: approved ? 'PENDING' : 'NOT_STARTED',
      decidedAt: new Date().toISOString(),
    };
    await this.db.$transaction(async (tx) => {
      await tx.dispatcherRevision.update({
        where: { id: revisionId },
        data: {
          status: approved ? 'APPROVED' : 'REJECTED',
          decidedAt: new Date(),
          decisionReason: input.reason,
          correctionFields: input.correctionFields ?? [],
        },
      });
      await tx.dispatcher.update({
        where: { id: revision.dispatcherId },
        data: approved
          ? {
              status: 'APPROVED',
              approvedRevisionId: revisionId,
              latestRevisionId: revisionId,
            }
          : revision.dispatcher.approvedRevisionId
            ? { latestRevisionId: revisionId }
            : { status: 'REJECTED', availability: false },
      });
      if (approved) {
        await tx.dispatcherProvisioningSaga.upsert({
          where: {
            dispatcherId_revisionId: {
              dispatcherId: revision.dispatcherId,
              revisionId,
            },
          },
          update: {
            status: 'PENDING',
            nextAttemptAt: new Date(),
            lastErrorCode: null,
          },
          create: {
            dispatcherId: revision.dispatcherId,
            revisionId,
            status: 'PENDING',
            nextAttemptAt: new Date(),
          },
        });
        await tx.dispatcher.update({
          where: { id: revision.dispatcherId },
          data: {
            riderProvisioningStatus: 'PENDING',
            riderProvisioningErrorCode: null,
          },
        });
      }
      await tx.idempotencyRecord.create({
        data: {
          scope,
          key: idempotencyKey,
          actorId,
          requestHash,
          responseStatus: 200,
          responseBody: body,
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        },
      });
    });
    await this.audit.record({
      tenantId: revision.dispatcher.tenantId,
      actorId,
      action: approved ? 'dispatcher.approved' : 'dispatcher.rejected',
      subjectId: revision.dispatcherId,
      requestId,
      metadata: { revisionId, reason: input.reason },
    });
    return body;
  }

  private validateDispatcher(input: CreateDispatcherDto) {
    if (!input.termsAccepted)
      throw new BadRequestException('Terms must be accepted');
    if (!input.guarantorAddress?.trim())
      throw new BadRequestException('Guarantor address is required');
    if (
      input.guarantorNin !== '__PRESERVE__' &&
      !/^\d{11}$/.test(input.guarantorNin)
    )
      throw new BadRequestException('Guarantor NIN must be exactly 11 digits');
    if (
      motorized.has(input.vehicleType) &&
      (!input.vehicleBrand?.trim() || !input.plateNumber?.trim())
    )
      throw new BadRequestException(
        'Vehicle brand and plate number are required for motorized vehicles',
      );
  }

  private revisionData(
    dispatcherId: string,
    version: number,
    input: CreateDispatcherDto,
    source?: Record<string, unknown>,
  ) {
    return {
      dispatcherId,
      version,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      dateOfBirth: new Date(input.dateOfBirth),
      gender: input.gender,
      identityType: input.identityType,
      encryptedIdentityNo:
        input.identityNumber === '__PRESERVE__' && source
          ? String(source.encryptedIdentityNo)
          : encryptSensitive(input.identityNumber),
      identityFingerprint:
        input.identityNumber === '__PRESERVE__' && source
          ? String(source.identityFingerprint)
          : sha256(input.identityNumber),
      identityExpiry: input.identityExpiry
        ? new Date(input.identityExpiry)
        : undefined,
      homeAddress: input.homeAddress.trim(),
      state: input.state.trim(),
      city: input.city.trim(),
      termsAcceptedAt: new Date(),
      engagementType: input.engagementType,
      vehicleType: input.vehicleType,
      vehicleBrand: input.vehicleBrand?.trim(),
      plateNumber: input.plateNumber?.trim(),
      vehicleRegistrationDate: new Date(input.vehicleRegistrationDate),
      guarantorName: input.guarantorName.trim(),
      guarantorPhone: input.guarantorPhone.trim(),
      guarantorEmail: input.guarantorEmail?.trim().toLowerCase(),
      guarantorAddress: input.guarantorAddress.trim(),
      encryptedGuarantorNin:
        input.guarantorNin === '__PRESERVE__' && source
          ? String(source.encryptedGuarantorNin)
          : encryptSensitive(input.guarantorNin),
      guarantorNinFingerprint:
        input.guarantorNin === '__PRESERVE__' && source
          ? String(source.guarantorNinFingerprint)
          : sha256(input.guarantorNin),
      revenueSharePct: new Prisma.Decimal(input.revenueSharePct),
    };
  }

  private mergeRevision(
    source: Record<string, unknown>,
    input: UpdateDispatcherDto,
  ) {
    return {
      firstName: input.firstName ?? String(source.firstName),
      lastName: input.lastName ?? String(source.lastName),
      email: input.email ?? String(source.email),
      phone: input.phone ?? String(source.phone),
      dateOfBirth:
        input.dateOfBirth ?? (source.dateOfBirth as Date).toISOString(),
      gender: input.gender ?? String(source.gender),
      identityType: input.identityType ?? String(source.identityType),
      identityNumber: input.identityNumber ?? '__PRESERVE__',
      identityExpiry:
        input.identityExpiry ??
        ((source.identityExpiry as Date | null)?.toISOString() || undefined),
      homeAddress: input.homeAddress ?? String(source.homeAddress),
      state: input.state ?? String(source.state),
      city: input.city ?? String(source.city),
      termsAccepted: input.termsAccepted ?? true,
      engagementType: input.engagementType ?? String(source.engagementType),
      vehicleType: input.vehicleType ?? String(source.vehicleType),
      vehicleBrand:
        input.vehicleBrand ?? (source.vehicleBrand as string | undefined),
      plateNumber:
        input.plateNumber ?? (source.plateNumber as string | undefined),
      vehicleRegistrationDate:
        input.vehicleRegistrationDate ??
        (source.vehicleRegistrationDate as Date).toISOString(),
      guarantorName: input.guarantorName ?? String(source.guarantorName),
      guarantorPhone: input.guarantorPhone ?? String(source.guarantorPhone),
      guarantorEmail:
        input.guarantorEmail ?? (source.guarantorEmail as string | undefined),
      guarantorNin:
        input.guarantorNin ??
        (source.encryptedGuarantorNin ? '__PRESERVE__' : ''),
      guarantorAddress:
        input.guarantorAddress ?? String(source.guarantorAddress ?? ''),
      revenueSharePct:
        input.revenueSharePct ?? Number(String(source.revenueSharePct)),
    } as CreateDispatcherDto;
  }

  private listItem(row: {
    id: string;
    status: string;
    availability: boolean;
    totalOrdersPicked: number;
    createdAt: Date;
    approvedRevision: Record<string, unknown> | null;
    latestRevision: Record<string, unknown> | null;
  }) {
    const profile = row.approvedRevision ?? row.latestRevision;
    return {
      id: row.id,
      status: row.status,
      availability: row.availability,
      totalOrdersPicked: row.totalOrdersPicked,
      createdAt: row.createdAt,
      pendingRevisionStatus:
        row.latestRevision && row.latestRevision !== row.approvedRevision
          ? row.latestRevision.status
          : null,
      ...(profile
        ? {
            firstName: profile.firstName,
            lastName: profile.lastName,
            email: profile.email,
            phone: profile.phone,
            state: profile.state,
            city: profile.city,
            vehicleType: profile.vehicleType,
            vehicleBrand: profile.vehicleBrand,
            plateNumber: profile.plateNumber,
            revenueSharePct: String(profile.revenueSharePct),
          }
        : {}),
    };
  }

  private safeDispatcher(row: Record<string, unknown>) {
    return {
      ...row,
      approvedRevision: row.approvedRevision
        ? this.safeRevision(row.approvedRevision as Record<string, unknown>)
        : null,
      latestRevision: row.latestRevision
        ? this.safeRevision(row.latestRevision as Record<string, unknown>)
        : null,
    };
  }

  private safeRevision(revision: Record<string, unknown>) {
    const {
      encryptedIdentityNo: _,
      identityFingerprint: __,
      encryptedGuarantorNin: ___,
      guarantorNinFingerprint: ____,
      documents,
      ...safe
    } = revision;
    return {
      ...safe,
      identityNumberMasked: '••••••••',
      guarantorNinMasked: revision.encryptedGuarantorNin ? '••••••••' : null,
      revenueSharePct: String(safe.revenueSharePct),
      documents: Array.isArray(documents)
        ? documents.map((value) => {
            const {
              objectKey: _objectKey,
              checksum: _checksum,
              scanMessage: _scanMessage,
              ...document
            } = value as Record<string, unknown>;
            return document;
          })
        : undefined,
    };
  }
}
