import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../core/database/prisma.service.js';
import type {
  BatchListQueryDto,
  ManifestActionDto,
  ManifestListQueryDto,
  ManifestPreviewDto,
  ManifestTransitionDto,
} from './manifests.dto.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const ACTIVE = [
  'SENT',
  'CHANGE_REQUESTED',
  'ACCEPTED',
  'IN_TRANSIT',
  'REROUTED',
  'REMOTE_LOCATION',
] as const;
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const reference = (prefix: string) =>
  `${prefix}-${randomBytes(6).toString('hex').toUpperCase()}`;

@Injectable()
export class ManifestsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications?: NotificationsService,
  ) {}

  parse(raw: string) {
    const submitted = raw
      .split(/[\n,]+/)
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    if (submitted.length > 500)
      throw new ConflictException('A maximum of 500 tracking IDs is allowed');
    const seen = new Set<string>();
    const duplicates: string[] = [];
    const unique = submitted.filter((value) => {
      if (seen.has(value)) {
        duplicates.push(value);
        return false;
      }
      seen.add(value);
      return true;
    });
    return { submitted, unique, duplicates };
  }

  private async classify(tenantId: string, raw: string) {
    const parsed = this.parse(raw);
    const orders = await this.db.order.findMany({
      where: { publicReference: { in: parsed.unique } },
      select: {
        id: true,
        tenantId: true,
        publicReference: true,
        source: true,
        status: true,
        paymentStatus: true,
        batchItem: { select: { orderId: true } },
        manifestItems: {
          where: { revision: { manifest: { status: { in: [...ACTIVE] } } } },
          select: { id: true },
          take: 1,
        },
      },
    });
    const byReference = new Map(
      orders.map((order) => [order.publicReference.toUpperCase(), order]),
    );
    const valid: Array<{ id: string; trackingId: string }> = [];
    const invalid: Array<{ trackingId: string; reason: string }> = [];
    for (const trackingId of parsed.unique) {
      const order = byReference.get(trackingId);
      const eligible =
        order?.tenantId === tenantId &&
        ((order.source === 'VENDOR_DIRECT' && order.status === 'READY') ||
          (order.source === 'CUSTOMER_LINK' &&
            order.status === 'ACCEPTED' &&
            order.paymentStatus === 'PAID'));
      const reason = !order
        ? 'NOT_FOUND'
        : order.tenantId !== tenantId
          ? 'NOT_FOUND'
          : !eligible
            ? 'NOT_DISPATCH_READY'
            : order.batchItem || order.manifestItems.length
              ? 'ALREADY_GROUPED'
              : null;
      if (reason) invalid.push({ trackingId, reason });
      else valid.push({ id: order!.id, trackingId });
    }
    return {
      total: parsed.submitted.length,
      valid,
      invalid,
      duplicates: parsed.duplicates,
    };
  }

  private async preview(
    tenantId: string,
    actorId: string,
    kind: string,
    payload: unknown,
  ) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    await this.db.manifestPreview.create({
      data: {
        tokenHash: hash(token),
        tenantId,
        actorId,
        kind,
        payload: payload as any,
        expiresAt,
      },
    });
    return { previewToken: token, expiresAt };
  }

  async validateBatch(tenantId: string, actorId: string, raw: string) {
    const result = await this.classify(tenantId, raw);
    const token = result.valid.length
      ? await this.preview(tenantId, actorId, 'BATCH', {
          orderIds: result.valid.map((item) => item.id),
        })
      : null;
    return { ...result, ...token };
  }

  async createBatch(tenantId: string, actorId: string, token: string) {
    const preview = await this.consumePreview(
      tenantId,
      actorId,
      token,
      'BATCH',
    );
    const orderIds = (preview.payload as { orderIds: string[] }).orderIds;
    const created = await this.db.$transaction(async (tx) => {
      const consumed = await tx.manifestPreview.updateMany({
        where: {
          id: preview.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1)
        throw new ConflictException('Preview has already been used');
      const eligible = await tx.order.count({
        where: {
          id: { in: orderIds },
          tenantId,
          batchItem: null,
          manifestItems: {
            none: {
              revision: { manifest: { status: { in: [...ACTIVE] } } },
            },
          },
          OR: [
            { source: 'VENDOR_DIRECT', status: 'READY' },
            {
              source: 'CUSTOMER_LINK',
              status: 'ACCEPTED',
              paymentStatus: 'PAID',
            },
          ],
        },
      });
      if (eligible !== orderIds.length)
        throw new ConflictException('Preview is stale; validate the IDs again');
      return tx.batch.create({
        data: {
          tenantId,
          createdById: actorId,
          publicReference: reference('B'),
          items: { create: orderIds.map((orderId) => ({ orderId })) },
        },
        include: { items: { include: { order: true } } },
      });
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'batch.created',
      subjectId: created.id,
    });
    return created;
  }

  listBatches(tenantId: string, query: BatchListQueryDto) {
    const where = {
      tenantId,
      ...(query.search
        ? {
            publicReference: {
              contains: query.search,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };
    return this.db.$transaction(async (tx) => {
      const [items, total] = await Promise.all([
        tx.batch.findMany({
          where,
          include: { _count: { select: { items: true } } },
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        tx.batch.count({ where }),
      ]);
      return { items, total, page: query.page, pageSize: query.pageSize };
    });
  }

  async batchDetail(tenantId: string, id: string) {
    const item = await this.db.batch.findFirst({
      where: { id, tenantId },
      include: { items: { include: { order: true } } },
    });
    if (!item) throw new NotFoundException('Batch not found');
    return item;
  }

  async directory(tenantId: string, search: string) {
    return this.db.vendor.findMany({
      where: {
        id: { not: tenantId },
        status: 'APPROVED',
        ...(search
          ? { businessName: { contains: search, mode: 'insensitive' } }
          : {}),
      },
      select: { id: true, businessName: true },
      orderBy: { businessName: 'asc' },
      take: 25,
    });
  }

  async previewManifest(
    tenantId: string,
    actorId: string,
    input: ManifestPreviewDto,
    manifestId?: string,
  ) {
    if (input.destinationVendorId === tenantId)
      throw new ConflictException('A manifest must be sent to another vendor');
    const destination = await this.db.vendor.findFirst({
      where: { id: input.destinationVendorId, status: 'APPROVED' },
      select: { id: true, businessName: true },
    });
    if (!destination) throw new NotFoundException('Receiving vendor not found');
    let existingItems: { batchIds: string[]; orderIds: string[] } | undefined;
    if (manifestId) {
      const manifest = await this.db.manifest.findFirst({
        where: {
          id: manifestId,
          originTenantId: tenantId,
          status: 'CHANGE_REQUESTED',
        },
        include: {
          revisions: {
            orderBy: { version: 'desc' },
            take: 1,
            include: { items: true },
          },
        },
      });
      if (!manifest)
        throw new ConflictException('Manifest is not awaiting a revision');
      if (manifest.destinationTenantId !== input.destinationVendorId)
        throw new ConflictException(
          'The receiving vendor cannot change during revision',
        );
      existingItems = {
        batchIds:
          manifest.revisions[0]?.items.flatMap((item) =>
            item.batchId ? [item.batchId] : [],
          ) ?? [],
        orderIds:
          manifest.revisions[0]?.items.flatMap((item) =>
            item.orderId ? [item.orderId] : [],
          ) ?? [],
      };
    }
    const requestedBatchIds = input.batchIds?.length
      ? input.batchIds
      : (existingItems?.batchIds ?? []);
    const batches = requestedBatchIds.length
      ? await this.db.batch.findMany({
          where: {
            id: { in: requestedBatchIds },
            tenantId,
            OR: [
              { status: 'FINALIZED' },
              ...(manifestId
                ? [{ manifestItems: { some: { revision: { manifestId } } } }]
                : []),
            ],
          },
          include: { items: { include: { order: true } } },
        })
      : [];
    if (batches.length !== new Set(requestedBatchIds).size)
      throw new ConflictException('One or more batches are unavailable');
    const validation = input.trackingIds
      ? await this.classify(tenantId, input.trackingIds)
      : { total: 0, valid: [], invalid: [], duplicates: [] };
    if (validation.invalid.length || validation.duplicates.length)
      throw new ConflictException('Remove invalid or duplicate tracking IDs');
    const orderIds = validation.valid.length
      ? validation.valid.map((item) => item.id)
      : (existingItems?.orderIds ?? []);
    if (!batches.length && !orderIds.length)
      throw new ConflictException(
        'At least one batch or tracking ID is required',
      );
    const payload = {
      ...input,
      batchIds: batches.map((batch) => batch.id),
      orderIds,
      manifestId,
    };
    const result = await this.preview(
      tenantId,
      actorId,
      manifestId ? 'REVISION' : 'MANIFEST',
      payload,
    );
    return {
      ...result,
      destination,
      batchCount: batches.length,
      orderCount:
        batches.reduce((n, batch) => n + batch.items.length, 0) +
        validation.valid.length,
      tracking: validation,
    };
  }

  async createManifest(
    tenantId: string,
    actorId: string,
    token: string,
    manifestId?: string,
  ) {
    const kind = manifestId ? 'REVISION' : 'MANIFEST';
    const preview = await this.consumePreview(tenantId, actorId, token, kind);
    const payload = preview.payload as unknown as ManifestPreviewDto & {
      batchIds: string[];
      orderIds: string[];
      manifestId?: string;
    };
    if (payload.manifestId !== manifestId)
      throw new ConflictException('Preview does not match this manifest');
    const result = await this.db.$transaction(async (tx) => {
      const consumed = await tx.manifestPreview.updateMany({
        where: {
          id: preview.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1)
        throw new ConflictException('Preview has already been used');
      const batches = await tx.batch.findMany({
        where: {
          id: { in: payload.batchIds },
          tenantId,
          OR: [
            { status: 'FINALIZED' },
            ...(manifestId
              ? [{ manifestItems: { some: { revision: { manifestId } } } }]
              : []),
          ],
        },
      });
      if (batches.length !== payload.batchIds.length)
        throw new ConflictException('A selected batch is no longer available');
      const directOrders = await tx.order.count({
        where: {
          id: { in: payload.orderIds },
          tenantId,
          batchItem: null,
          OR: [
            { source: 'VENDOR_DIRECT', status: 'READY' },
            {
              source: 'CUSTOMER_LINK',
              status: 'ACCEPTED',
              paymentStatus: 'PAID',
            },
          ],
          manifestItems: manifestId
            ? { some: { revision: { manifestId } } }
            : {
                none: {
                  revision: { manifest: { status: { in: [...ACTIVE] } } },
                },
              },
        },
      });
      if (directOrders !== payload.orderIds.length)
        throw new ConflictException('A selected order is no longer available');
      let manifest;
      let version = 1;
      if (manifestId) {
        const current = await tx.manifest.findFirst({
          where: {
            id: manifestId,
            originTenantId: tenantId,
            status: 'CHANGE_REQUESTED',
          },
        });
        if (!current)
          throw new ConflictException('Manifest changed concurrently');
        version = current.currentVersion + 1;
        manifest = await tx.manifest.update({
          where: { id: current.id },
          data: { currentVersion: version, status: 'SENT' },
        });
      } else {
        manifest = await tx.manifest.create({
          data: {
            publicReference: reference('M'),
            waybillNumber: reference('WB'),
            originTenantId: tenantId,
            destinationTenantId: payload.destinationVendorId,
            createdById: actorId,
          },
        });
      }
      await tx.manifestRevision.create({
        data: {
          manifestId: manifest.id,
          version,
          name: payload.name,
          originState: payload.originState,
          originCity: payload.originCity,
          destinationState: payload.destinationState,
          destinationCity: payload.destinationCity,
          createdById: actorId,
          items: {
            create: [
              ...payload.batchIds.map((batchId) => ({ batchId })),
              ...payload.orderIds.map((orderId) => ({ orderId })),
            ],
          },
        },
      });
      if (payload.batchIds.length && !manifestId) {
        const reserved = await tx.batch.updateMany({
          where: { id: { in: payload.batchIds }, status: 'FINALIZED' },
          data: { status: 'MANIFESTED', manifestedAt: new Date() },
        });
        if (reserved.count !== payload.batchIds.length)
          throw new ConflictException('A selected batch changed concurrently');
      }
      await tx.manifestAction.create({
        data: {
          manifestId: manifest.id,
          actorId,
          actorTenantId: tenantId,
          action: manifestId ? 'REVISION_SENT' : 'CREATED',
          fromStatus: manifestId ? 'CHANGE_REQUESTED' : null,
          toStatus: 'SENT',
        },
      });
      return manifest;
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: manifestId ? 'manifest.revised' : 'manifest.created',
      subjectId: result.id,
    });
    await this.notifications?.emit({
      tenantId: result.destinationTenantId,
      permission: 'manifests.read',
      type: manifestId ? 'MANIFEST_REVISION_ASSIGNED' : 'MANIFEST_ASSIGNED',
      title: manifestId ? 'Manifest revision assigned' : 'Manifest assigned',
      body: `${result.publicReference} has been assigned to your team.`,
      href: '/operations?view=assigned-manifests',
      uniqueKey: `manifest:${result.id}:assigned:${result.currentVersion}`,
      email: true,
    });
    return this.detail(tenantId, result.id);
  }

  async list(tenantId: string, query: ManifestListQueryDto) {
    const where: any = {
      [query.direction === 'inbound'
        ? 'destinationTenantId'
        : 'originTenantId']: tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              {
                publicReference: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                waybillNumber: { contains: query.search, mode: 'insensitive' },
              },
              {
                revisions: {
                  some: {
                    name: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.manifest.findMany({
        where,
        include: {
          originVendor: { select: { id: true, businessName: true } },
          destinationVendor: { select: { id: true, businessName: true } },
          revisions: {
            where: { version: { gt: 0 } },
            orderBy: { version: 'desc' },
            take: 1,
            include: { _count: { select: { items: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.manifest.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async detail(tenantId: string, id: string) {
    const item = await this.db.manifest.findFirst({
      where: {
        id,
        OR: [{ originTenantId: tenantId }, { destinationTenantId: tenantId }],
      },
      include: {
        originVendor: { select: { id: true, businessName: true } },
        destinationVendor: { select: { id: true, businessName: true } },
        revisions: {
          orderBy: { version: 'desc' },
          include: {
            items: {
              include: {
                order: {
                  select: {
                    id: true,
                    publicReference: true,
                    itemDescription: true,
                    receiver: true,
                    delivery: true,
                    deliveryStatus: true,
                    paymentStatus: true,
                    amountMinor: true,
                    currency: true,
                    updatedAt: true,
                    dispatchItems: {
                      take: 1,
                      select: {
                        dispatch: {
                          select: {
                            publicReference: true,
                            optimizedDistanceMetres: true,
                            optimizedDurationSeconds: true,
                            events: { orderBy: { createdAt: 'asc' } },
                          },
                        },
                      },
                    },
                  },
                },
                batch: { select: { id: true, publicReference: true } },
              },
            },
          },
        },
        actions: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!item) throw new NotFoundException('Manifest not found');
    return item;
  }

  async respond(
    tenantId: string,
    actorId: string,
    id: string,
    input: ManifestActionDto,
    key: string,
  ) {
    if (!key) throw new ConflictException('Idempotency-Key is required');
    if (input.action !== 'accept' && !input.message?.trim())
      throw new ConflictException('A reason or message is required');
    const manifest = await this.db.manifest.findFirst({
      where: { id, destinationTenantId: tenantId },
    });
    if (!manifest) throw new NotFoundException('Manifest not found');
    if (manifest.status !== 'SENT' || manifest.currentVersion !== input.version)
      throw new ConflictException('Manifest changed or cannot be actioned');
    const next =
      input.action === 'accept'
        ? 'ACCEPTED'
        : input.action === 'decline'
          ? 'DECLINED'
          : 'CHANGE_REQUESTED';
    return this.transitionRecord(
      manifest,
      tenantId,
      actorId,
      input.action.toUpperCase(),
      next,
      input.message,
      key,
    );
  }

  async transition(
    tenantId: string,
    actorId: string,
    id: string,
    input: ManifestTransitionDto,
    key: string,
  ) {
    if (!key) throw new ConflictException('Idempotency-Key is required');
    if (
      ['REROUTED', 'REMOTE_LOCATION'].includes(input.status) &&
      !input.message?.trim()
    )
      throw new ConflictException('An exception message is required');
    const manifest = await this.db.manifest.findFirst({
      where: { id, destinationTenantId: tenantId },
    });
    if (!manifest) throw new NotFoundException('Manifest not found');
    if (manifest.currentVersion !== input.version)
      throw new ConflictException('Manifest changed concurrently');
    const allowed =
      manifest.status === 'ACCEPTED'
        ? ['IN_TRANSIT']
        : ['IN_TRANSIT', 'REROUTED', 'REMOTE_LOCATION'].includes(
              manifest.status,
            )
          ? ['IN_TRANSIT', 'REROUTED', 'REMOTE_LOCATION', 'DELIVERED']
          : [];
    if (!allowed.includes(input.status))
      throw new ConflictException('Manifest transition is not allowed');
    return this.transitionRecord(
      manifest,
      tenantId,
      actorId,
      'STATUS_UPDATED',
      input.status,
      input.message,
      key,
    );
  }

  private async transitionRecord(
    manifest: any,
    tenantId: string,
    actorId: string,
    action: string,
    next: string,
    message: string | undefined,
    key: string,
  ) {
    const scope = `manifest:${manifest.id}:${action}`;
    const replay = await this.db.idempotencyRecord.findUnique({
      where: { scope_key: { scope, key } },
    });
    if (replay) return replay.responseBody;
    const result = await this.db.$transaction(async (tx) => {
      const updated = await tx.manifest.updateMany({
        where: {
          id: manifest.id,
          status: manifest.status,
          currentVersion: manifest.currentVersion,
        },
        data: { status: next as any },
      });
      if (updated.count !== 1)
        throw new ConflictException('Manifest changed concurrently');
      await tx.manifestAction.create({
        data: {
          manifestId: manifest.id,
          actorId,
          actorTenantId: tenantId,
          action,
          fromStatus: manifest.status,
          toStatus: next as any,
          message,
        },
      });
      const response = await tx.manifest.findUniqueOrThrow({
        where: { id: manifest.id },
      });
      await tx.idempotencyRecord.create({
        data: {
          scope,
          key,
          actorId,
          requestHash: hash(JSON.stringify({ action, next, message })),
          responseStatus: 200,
          responseBody: response as any,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      return response;
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: `manifest.${action.toLowerCase()}`,
      subjectId: manifest.id,
      metadata: { message: message ?? null },
    });
    const recipientTenantId =
      tenantId === manifest.originTenantId
        ? manifest.destinationTenantId
        : manifest.originTenantId;
    await this.notifications?.emit({
      tenantId: recipientTenantId,
      permission: 'manifests.read',
      type: 'MANIFEST_ACTION',
      title: 'Manifest updated',
      body: `${manifest.publicReference} is now ${next.toLowerCase().replaceAll('_', ' ')}.`,
      href:
        recipientTenantId === manifest.destinationTenantId
          ? '/operations?view=assigned-manifests'
          : '/manifest?view=travel-manifest',
      uniqueKey: `manifest:${manifest.id}:${action}:${manifest.currentVersion}`,
      email: true,
    });
    return result;
  }

  private async consumePreview(
    tenantId: string,
    actorId: string,
    token: string,
    kind: string,
  ) {
    const preview = await this.db.manifestPreview.findFirst({
      where: {
        tokenHash: hash(token),
        tenantId,
        actorId,
        kind,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!preview) throw new ConflictException('Preview is invalid or expired');
    return preview;
  }

  async waybill(tenantId: string, id: string, version?: number) {
    const manifest = await this.detail(tenantId, id);
    const revision = manifest.revisions.find(
      (item) => item.version === (version ?? manifest.currentVersion),
    );
    if (!revision) throw new NotFoundException('Manifest revision not found');
    const lines = [
      'PEPSA LOGISTICS - WAYBILL',
      `Waybill: ${manifest.waybillNumber}`,
      `Manifest: ${manifest.publicReference}`,
      `Name: ${revision.name}`,
      `Revision: ${revision.version}`,
      `Status: ${manifest.status.replaceAll('_', ' ')}`,
      `Origin: ${manifest.originVendor.businessName} - ${revision.originCity}, ${revision.originState}`,
      `Destination: ${manifest.destinationVendor.businessName} - ${revision.destinationCity}, ${revision.destinationState}`,
      `Created: ${manifest.createdAt.toISOString()}`,
      '',
      'SHIPMENTS',
      ...revision.items.map(
        (item) =>
          item.order?.publicReference ??
          item.batch?.publicReference ??
          'Unknown',
      ),
    ];
    return {
      filename: `${manifest.waybillNumber}-v${revision.version}.pdf`,
      buffer: this.pdf(lines),
    };
  }

  private pdf(lines: string[]) {
    const escape = (value: string) =>
      value
        .replaceAll('\\', '\\\\')
        .replaceAll('(', '\\(')
        .replaceAll(')', '\\)')
        .replace(/[^\x20-\x7E]/g, '?');
    const content = [
      'BT',
      '/F1 12 Tf',
      '50 790 Td',
      ...lines
        .flatMap((line, index) => [
          index ? '0 -20 Td' : '',
          `(${escape(line)}) Tj`,
        ])
        .filter(Boolean),
      'ET',
    ].join('\n');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    let body = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, i) => {
      offsets.push(Buffer.byteLength(body));
      body += `${i + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = Buffer.byteLength(body);
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, '0')} 00000 n `)
      .join(
        '\n',
      )}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(body);
  }
}
