import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { FeesService } from '../fees/fees.service.js';
import { ProvisioningService } from '../provisioning/provisioning.service.js';
import { PaymentService } from '../../integrations/payment/payment.service.js';
import type {
  ActivateFeePolicyDto,
  AdjustFeeAssessmentDto,
  CreateFeePolicyDto,
  RetireFeePolicyDto,
  SimulateFeeDto,
} from '../fees/fees.dto.js';
import { createHash } from 'node:crypto';

@Injectable()
export class VendorAdminService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly fees: FeesService,
    private readonly provisioning: ProvisioningService,
    private readonly payment: PaymentService,
  ) {}

  async idempotentMutation<T>(
    actorId: string,
    operation: string,
    key: string,
    body: Record<string, unknown>,
    execute: () => Promise<T> | T,
  ): Promise<T> {
    const scope = `vendor-admin:${operation}`;
    const requestHash = createHash('sha256')
      .update(JSON.stringify(body))
      .digest('hex');
    const existing = await this.db.idempotencyRecord.findUnique({
      where: { scope_key: { scope, key } },
    });
    if (existing) {
      if (existing.actorId !== actorId || existing.requestHash !== requestHash)
        throw new BadRequestException('Idempotency key conflict');
      return existing.responseBody as T;
    }
    const response = await execute();
    await this.db.idempotencyRecord.create({
      data: {
        scope,
        key,
        actorId,
        requestHash,
        responseStatus: 200,
        responseBody: response as never,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    return response;
  }

  async replayDelivery(
    eventId: string,
    actorId: string,
    reason: string,
    requestId?: string,
  ) {
    if (!eventId.trim()) throw new BadRequestException('eventId is required');
    const result = await this.payment.replayEvent(eventId, reason);
    await this.audit.record({
      actorId,
      action: 'payment.delivery_replay_requested',
      subjectId: eventId,
      requestId,
      metadata: { reason },
    });
    return result;
  }

  async overview() {
    const [vendors, orders, dispatches, manifests, settlement, fees] =
      await Promise.all([
        this.db.vendor.groupBy({ by: ['status'], _count: { _all: true } }),
        this.db.order.groupBy({
          by: ['source', 'status'],
          _count: { _all: true },
          _sum: { amountMinor: true },
        }),
        this.db.dispatch.groupBy({
          by: ['mode', 'status'],
          _count: { _all: true },
          _sum: { feeAmountMinor: true },
        }),
        this.db.manifest.groupBy({ by: ['status'], _count: { _all: true } }),
        this.db.vendorSettlementEntry.aggregate({
          _sum: { totalAmountMinor: true, earningsMinor: true },
          _count: { _all: true },
        }),
        this.db.feeReceivable.aggregate({
          where: { status: 'OUTSTANDING' },
          _sum: { amountMinor: true, collectedMinor: true },
          _count: { _all: true },
        }),
      ]);
    return {
      asOf: new Date().toISOString(),
      timezone: 'Africa/Lagos',
      currency: 'NGN',
      source: 'vendor',
      dataQuality: 'CURRENT',
      vendors: vendors.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      orders: orders.map((row) => ({
        source: row.source,
        status: row.status,
        count: row._count._all,
        amountMinor: row._sum.amountMinor ?? 0,
      })),
      dispatches: dispatches.map((row) => ({
        mode: row.mode,
        status: row.status,
        count: row._count._all,
        feeAmountMinor: row._sum.feeAmountMinor ?? 0,
      })),
      manifests: manifests.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      finance: {
        projectionCount: settlement._count._all,
        projectedTotalMinor: settlement._sum.totalAmountMinor ?? 0,
        projectedEarningsMinor: settlement._sum.earningsMinor ?? 0,
        outstandingFeeCount: fees._count._all,
        outstandingFeeMinor:
          (fees._sum.amountMinor ?? 0) - (fees._sum.collectedMinor ?? 0),
        classification: 'PROJECTED',
      },
    };
  }

  async performance(days: number, scopedVendorIds?: string[]) {
    if (!Number.isInteger(days) || days < 1 || days > 90)
      throw new BadRequestException('days must be an integer between 1 and 90');
    const from = new Date(Date.now() - (days - 1) * 86_400_000);
    from.setUTCHours(0, 0, 0, 0);
    const tenantWhere = scopedVendorIds?.length
      ? { tenantId: { in: scopedVendorIds } }
      : {};
    const [orders, dispatches, settlements, vendors] = await Promise.all([
      this.db.order.findMany({
        where: { ...tenantWhere, createdAt: { gte: from } },
        select: {
          tenantId: true,
          source: true,
          status: true,
          paymentStatus: true,
          amountMinor: true,
          currency: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.db.dispatch.findMany({
        where: { ...tenantWhere, createdAt: { gte: from } },
        select: {
          tenantId: true,
          mode: true,
          status: true,
          feeAmountMinor: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      this.db.vendorSettlementEntry.findMany({
        where: { ...tenantWhere, createdAt: { gte: from } },
        select: {
          tenantId: true,
          status: true,
          totalAmountMinor: true,
          earningsMinor: true,
          createdAt: true,
        },
      }),
      this.db.vendor.findMany({
        where: scopedVendorIds?.length ? { id: { in: scopedVendorIds } } : {},
        select: { id: true, businessName: true },
      }),
    ]);
    const dates = Array.from({ length: days }, (_, offset) => {
      const date = new Date(from.getTime() + offset * 86_400_000);
      return date.toISOString().slice(0, 10);
    });
    const series = dates.map((date) => {
      const dayOrders = orders.filter((row) =>
        row.createdAt.toISOString().startsWith(date),
      );
      const dayDispatches = dispatches.filter((row) =>
        row.createdAt.toISOString().startsWith(date),
      );
      const daySettlements = settlements.filter((row) =>
        row.createdAt.toISOString().startsWith(date),
      );
      const priced = dayOrders.filter((row) => row.amountMinor !== null);
      return {
        date,
        orderCount: dayOrders.length,
        pricedOrderCount: priced.length,
        unpricedOrderCount: dayOrders.length - priced.length,
        gmvMinor: priced.reduce((sum, row) => sum + (row.amountMinor ?? 0), 0),
        dispatchCount: dayDispatches.length,
        completedDispatchCount: dayDispatches.filter((row) => row.completedAt)
          .length,
        projectedSettlementMinor: daySettlements.reduce(
          (sum, row) => sum + row.totalAmountMinor,
          0,
        ),
      };
    });
    const byVendor = vendors.map((vendor) => {
      const vendorOrders = orders.filter((row) => row.tenantId === vendor.id);
      const vendorDispatches = dispatches.filter(
        (row) => row.tenantId === vendor.id,
      );
      const vendorSettlements = settlements.filter(
        (row) => row.tenantId === vendor.id,
      );
      return {
        vendorId: vendor.id,
        businessName: vendor.businessName,
        orderCount: vendorOrders.length,
        unpricedOrderCount: vendorOrders.filter(
          (row) => row.amountMinor === null,
        ).length,
        dispatchCount: vendorDispatches.length,
        completedDispatchCount: vendorDispatches.filter(
          (row) => row.completedAt,
        ).length,
        projectedEarningsMinor: vendorSettlements.reduce(
          (sum, row) => sum + row.earningsMinor,
          0,
        ),
      };
    });
    const watermarks = [
      ...orders.map((row) => row.updatedAt),
      ...dispatches.map((row) => row.completedAt ?? row.createdAt),
      ...settlements.map((row) => row.createdAt),
    ];
    return {
      source: 'vendor',
      asOf: new Date().toISOString(),
      watermark: watermarks.length
        ? new Date(Math.max(...watermarks.map(Number))).toISOString()
        : null,
      timezone: 'Africa/Lagos',
      currency: 'NGN',
      freshness: 'LIVE_API',
      classification: 'PROJECTED',
      dataQuality: 'COMPLETE',
      gmvDefinition:
        'Sum of non-null Vendor order amounts; unpriced orders are reported separately and Payment remains authoritative for received value.',
      series,
      vendors: byVendor,
    };
  }

  async correlationSearch(value: string, scopedVendorIds?: string[]) {
    const query = value.trim();
    if (query.length < 3 || query.length > 120)
      throw new BadRequestException(
        'q must contain between 3 and 120 characters',
      );
    const tenantWhere = scopedVendorIds?.length
      ? { tenantId: { in: scopedVendorIds } }
      : {};
    const [orders, dispatches, settlements, cases, audits] = await Promise.all([
      this.db.order.findMany({
        where: {
          ...tenantWhere,
          OR: [
            { id: query },
            { publicReference: { equals: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          tenantId: true,
          publicReference: true,
          status: true,
          updatedAt: true,
        },
        take: 20,
      }),
      this.db.dispatch.findMany({
        where: {
          ...tenantWhere,
          OR: [
            { id: query },
            { publicReference: { equals: query, mode: 'insensitive' } },
            { providerReference: { equals: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          tenantId: true,
          publicReference: true,
          providerReference: true,
          status: true,
          createdAt: true,
        },
        take: 20,
      }),
      this.db.vendorSettlementEntry.findMany({
        where: {
          ...tenantWhere,
          OR: [
            { id: query },
            { sourceReference: query },
            { paymentReference: query },
          ],
        },
        select: {
          id: true,
          tenantId: true,
          sourceReference: true,
          paymentReference: true,
          status: true,
          createdAt: true,
        },
        take: 20,
      }),
      this.db.reconciliationCase.findMany({
        where: {
          ...tenantWhere,
          OR: [
            { id: query },
            { sourceReference: query },
            { subjectId: query },
            { requestId: query },
          ],
        },
        select: {
          id: true,
          tenantId: true,
          category: true,
          sourceReference: true,
          subjectId: true,
          requestId: true,
          status: true,
          createdAt: true,
        },
        take: 20,
      }),
      this.db.auditEvent.findMany({
        where: {
          ...(scopedVendorIds?.length
            ? { tenantId: { in: scopedVendorIds } }
            : {}),
          OR: [{ id: query }, { subjectId: query }, { requestId: query }],
        },
        select: {
          id: true,
          tenantId: true,
          action: true,
          subjectId: true,
          requestId: true,
          outcome: true,
          createdAt: true,
        },
        take: 20,
      }),
    ]);
    return {
      source: 'vendor',
      asOf: new Date().toISOString(),
      timezone: 'Africa/Lagos',
      currency: 'NGN',
      freshness: 'LIVE_API',
      classification: 'MIXED',
      dataQuality: 'COMPLETE',
      query,
      results: {
        orders,
        dispatches,
        settlements,
        reconciliationCases: cases,
        audits,
      },
    };
  }

  async operationalHealth(scopedVendorIds?: string[]) {
    const tenantWhere = scopedVendorIds?.length
      ? { tenantId: { in: scopedVendorIds } }
      : {};
    const now = Date.now();
    const [
      provisioning,
      reconciliation,
      receivables,
      dispatches,
      providerPending,
      paymentEvents,
      deadLetters,
    ] = await Promise.all([
      this.db.vendorProvisioningSaga.count({
        where: {
          ...tenantWhere,
          status: { notIn: ['ACTIVE', 'MANUAL_REVIEW'] },
          updatedAt: { lt: new Date(now - 15 * 60_000) },
        },
      }),
      this.db.reconciliationCase.count({
        where: { ...tenantWhere, status: 'OPEN' },
      }),
      this.db.feeReceivable.count({
        where: {
          ...tenantWhere,
          status: 'OUTSTANDING',
          createdAt: { lt: new Date(now - 7 * 86_400_000) },
        },
      }),
      this.db.dispatch.count({
        where: {
          ...tenantWhere,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          createdAt: { lt: new Date(now - 24 * 60 * 60_000) },
        },
      }),
      this.db.dispatch.count({
        where: {
          ...tenantWhere,
          mode: 'GENERAL_POOL',
          status: 'PENDING_MATCH',
          createdAt: { lt: new Date(now - 15 * 60_000) },
        },
      }),
      this.db.paymentWebhookEvent.count({
        where: {
          processedAt: null,
          createdAt: { lt: new Date(now - 5 * 60_000) },
        },
      }),
      this.db.emailOutbox.count({ where: { failedAt: { not: null } } }),
    ]);
    const alerts = [
      [
        'PROVISIONING_AGE',
        provisioning,
        0,
        'docs/runbooks/provisioning-failure.md',
      ],
      [
        'RECONCILIATION_VARIANCE',
        reconciliation,
        0,
        'docs/runbooks/payment-mismatch.md',
      ],
      ['RECEIVABLE_AGE', receivables, 0, 'docs/runbooks/incorrect-fee.md'],
      ['STUCK_LIFECYCLE', dispatches, 0, 'docs/runbooks/stuck-order.md'],
      [
        'PROVIDER_UNAVAILABLE',
        providerPending,
        0,
        'docs/runbooks/provider-ambiguity.md',
      ],
      [
        'CALLBACK_LAG',
        paymentEvents,
        0,
        'docs/runbooks/duplicate-conflicting-event.md',
      ],
      [
        'OUTBOX_DLQ_GROWTH',
        deadLetters,
        0,
        'docs/runbooks/duplicate-conflicting-event.md',
      ],
    ].map(([code, value, threshold, runbook]) => ({
      code,
      status: Number(value) > Number(threshold) ? 'ALERTING' : 'HEALTHY',
      value,
      threshold,
      runbook,
    }));
    return {
      source: 'vendor',
      asOf: new Date().toISOString(),
      timezone: 'Africa/Lagos',
      currency: 'NGN',
      freshness: 'LIVE_API',
      classification: 'OPERATIONAL',
      dataQuality: 'COMPLETE',
      alerts,
    };
  }

  async vendors(query: URLSearchParams, scopedVendorIds?: string[]) {
    const requestedSize = Number(query.get('pageSize') ?? 25);
    if (!Number.isInteger(requestedSize) || requestedSize < 1)
      throw new BadRequestException('pageSize must be a positive integer');
    const take = Math.min(100, requestedSize);
    const search = query.get('search')?.trim();
    const status = query.get('status')?.trim();
    const cursor = query.get('cursor')?.trim();
    if (
      status &&
      ![
        'EMAIL_PENDING',
        'IN_PROGRESS',
        'UNDER_REVIEW',
        'APPROVED_PROVISIONING',
        'APPROVED',
        'REJECTED',
        'SUSPENDED',
      ].includes(status)
    )
      throw new BadRequestException('Invalid vendor status filter');
    if (
      cursor &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        cursor,
      )
    )
      throw new BadRequestException('Invalid cursor');
    const rows = await this.db.vendor.findMany({
      where: {
        ...(scopedVendorIds?.length ? { id: { in: scopedVendorIds } } : {}),
        ...(status ? { status: status as never } : {}),
        ...(search
          ? {
              OR: [
                { businessName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        businessName: true,
        email: true,
        phone: true,
        type: true,
        status: true,
        paymentProvisioning: true,
        dispatchCreationFrozen: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            orders: true,
            dispatches: true,
            outboundManifests: true,
            dispatchers: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const items = rows.slice(0, take);
    return {
      items,
      nextCursor: hasMore ? items.at(-1)?.id : null,
      asOf: new Date().toISOString(),
      timezone: 'Africa/Lagos',
      currency: 'NGN',
      source: 'vendor',
      freshness: 'CURRENT',
      classification: 'AUTHORITATIVE',
      dataQuality: 'COMPLETE',
    };
  }

  async vendor(id: string) {
    const value = await this.db.vendor.findUnique({
      where: { id },
      select: {
        id: true,
        businessName: true,
        email: true,
        phone: true,
        type: true,
        status: true,
        paymentProvisioning: true,
        dispatchCreationFrozen: true,
        createdAt: true,
        updatedAt: true,
        applications: {
          select: {
            id: true,
            version: true,
            status: true,
            submittedAt: true,
            decidedAt: true,
            decisionReason: true,
          },
          orderBy: { version: 'desc' },
        },
        provisioningSagas: {
          select: {
            id: true,
            status: true,
            attempts: true,
            lastErrorCode: true,
            lastRequestId: true,
            createdAt: true,
            updatedAt: true,
            completedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        feePolicyOverrides: {
          where: { status: { in: ['ACTIVE', 'SCHEDULED'] } },
          orderBy: { version: 'desc' },
        },
        _count: {
          select: {
            orders: true,
            dispatches: true,
            outboundManifests: true,
            inboundManifests: true,
            dispatchers: true,
            customers: true,
            users: true,
          },
        },
      },
    });
    if (!value) throw new NotFoundException('Vendor not found');
    const [orders, dispatches, settlement, debts] = await Promise.all([
      this.db.order.groupBy({
        where: { tenantId: id },
        by: ['source', 'status'],
        _count: { _all: true },
        _sum: { amountMinor: true },
      }),
      this.db.dispatch.groupBy({
        where: { tenantId: id },
        by: ['mode', 'status'],
        _count: { _all: true },
      }),
      this.db.vendorSettlementEntry.aggregate({
        where: { tenantId: id },
        _sum: { totalAmountMinor: true, earningsMinor: true },
        _count: { _all: true },
      }),
      this.db.feeReceivable.aggregate({
        where: { tenantId: id, status: 'OUTSTANDING' },
        _sum: { amountMinor: true, collectedMinor: true },
        _count: { _all: true },
      }),
    ]);
    return {
      ...value,
      performance: { orders, dispatches },
      finance: {
        classification: 'PROJECTED',
        projectionCount: settlement._count._all,
        totalAmountMinor: settlement._sum.totalAmountMinor ?? 0,
        earningsMinor: settlement._sum.earningsMinor ?? 0,
        outstandingFeeCount: debts._count._all,
        outstandingFeeMinor:
          (debts._sum.amountMinor ?? 0) - (debts._sum.collectedMinor ?? 0),
      },
      asOf: new Date().toISOString(),
    };
  }

  async setStatus(
    id: string,
    actorId: string,
    status: 'SUSPENDED' | 'APPROVED',
    reason: string,
  ) {
    if (!reason?.trim()) throw new BadRequestException('Reason is required');
    const current = await this.db.vendor.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Vendor not found');
    if (status === 'APPROVED' && current.paymentProvisioning !== 'ACTIVE')
      throw new BadRequestException(
        'Vendor cannot be activated before Payment provisioning',
      );
    const value = await this.db.vendor.update({
      where: { id },
      data: { status },
    });
    await this.audit.record({
      tenantId: id,
      actorId,
      action: `admin.vendor.${status.toLowerCase()}`,
      subjectId: id,
      metadata: { reason },
    });
    return { id: value.id, status: value.status, updatedAt: value.updatedAt };
  }

  async setDispatchFreeze(
    id: string,
    actorId: string,
    frozen: boolean,
    reason: string,
  ) {
    const current = await this.db.vendor.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Vendor not found');
    const value = await this.db.vendor.update({
      where: { id },
      data: { dispatchCreationFrozen: frozen },
    });
    await this.audit.record({
      tenantId: id,
      actorId,
      action: frozen
        ? 'admin.vendor.dispatch_frozen'
        : 'admin.vendor.dispatch_unfrozen',
      subjectId: id,
      metadata: { reason },
    });
    return { id, dispatchCreationFrozen: value.dispatchCreationFrozen };
  }

  async revokeSessions(id: string, actorId: string, reason: string) {
    const vendor = await this.db.vendor.findUnique({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    const revoked = await this.db.session.updateMany({
      where: { user: { tenantId: id }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      tenantId: id,
      actorId,
      action: 'admin.vendor.sessions_revoked',
      subjectId: id,
      metadata: { reason, count: revoked.count },
    });
    return { vendorId: id, revokedSessions: revoked.count };
  }

  auditRead(
    actorId: string,
    operation: string,
    requestId?: string,
    tenantId?: string,
  ) {
    return this.audit.record({
      tenantId,
      actorId,
      action: `admin.read.${operation}`,
      requestId,
      metadata: { operation },
    });
  }

  provisioningList(scopedVendorIds?: string[]) {
    return this.provisioning.list(scopedVendorIds);
  }
  provisioningRetry(vendorId: string) {
    return this.provisioning.retry(vendorId);
  }
  feePolicies(scopedVendorIds?: string[]) {
    return this.fees.list(scopedVendorIds);
  }
  feePolicyCreate(actorId: string, input: CreateFeePolicyDto) {
    return this.fees.create(actorId, input);
  }
  feePolicySimulate(input: SimulateFeeDto) {
    return this.fees.simulate(input);
  }
  feePolicyActivate(actorId: string, id: string, input: ActivateFeePolicyDto) {
    return this.fees.activate(actorId, id, input);
  }
  feePolicyRetire(actorId: string, id: string, input: RetireFeePolicyDto) {
    return this.fees.retire(actorId, id, input);
  }
  feeAssessmentAdjust(
    actorId: string,
    id: string,
    input: AdjustFeeAssessmentDto,
  ) {
    return this.fees.adjust(actorId, id, input);
  }
  feeReport(tenantId?: string) {
    return this.fees.report(tenantId);
  }

  async resolveException(
    caseId: string,
    actorId: string,
    reason: string,
    requestId?: string,
  ) {
    const current = await this.db.reconciliationCase.findUnique({
      where: { id: caseId },
    });
    if (!current || current.status !== 'OPEN')
      throw new NotFoundException('Open reconciliation case not found');
    const resolved = await this.db.reconciliationCase.update({
      where: { id: caseId },
      data: {
        status: 'RESOLVED',
        resolvedById: actorId,
        resolutionReason: reason,
        resolvedAt: new Date(),
      },
    });
    await this.audit.record({
      tenantId: current.tenantId,
      actorId,
      action: 'admin.reconciliation.resolved',
      subjectId: current.id,
      requestId,
      metadata: { reason, category: current.category },
    });
    return {
      id: resolved.id,
      status: resolved.status,
      resolvedAt: resolved.resolvedAt,
    };
  }

  async workbench(
    view:
      | 'operations'
      | 'finance'
      | 'exceptions'
      | 'audit'
      | 'reviews'
      | 'dispatchers',
    scopedVendorIds?: string[],
  ) {
    const tenantWhere = scopedVendorIds?.length
      ? { tenantId: { in: scopedVendorIds } }
      : {};
    const base = {
      source: 'vendor',
      asOf: new Date().toISOString(),
      timezone: 'Africa/Lagos',
      currency: 'NGN',
      freshness: 'CURRENT',
      dataQuality: 'COMPLETE',
    } as const;
    if (view === 'operations') {
      const [orders, dispatches, manifests] = await Promise.all([
        this.db.order.findMany({
          where: tenantWhere,
          select: {
            id: true,
            publicReference: true,
            source: true,
            status: true,
            paymentStatus: true,
            amountMinor: true,
            currency: true,
            createdAt: true,
            vendor: { select: { businessName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        this.db.dispatch.findMany({
          where: tenantWhere,
          select: {
            id: true,
            publicReference: true,
            mode: true,
            status: true,
            providerReference: true,
            createdAt: true,
            vendor: { select: { businessName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        this.db.manifest.findMany({
          where: scopedVendorIds?.length
            ? {
                OR: [
                  { originTenantId: { in: scopedVendorIds } },
                  { destinationTenantId: { in: scopedVendorIds } },
                ],
              }
            : {},
          select: {
            id: true,
            waybillNumber: true,
            status: true,
            updatedAt: true,
            originVendor: { select: { businessName: true } },
            destinationVendor: { select: { businessName: true } },
          },
          orderBy: { updatedAt: 'desc' },
          take: 50,
        }),
      ]);
      return {
        ...base,
        classification: 'AUTHORITATIVE',
        orders,
        dispatches,
        manifests,
      };
    }
    if (view === 'finance') {
      const [settlements, receivables] = await Promise.all([
        this.db.vendorSettlementEntry.findMany({
          where: tenantWhere,
          select: {
            id: true,
            source: true,
            sourceReference: true,
            totalAmountMinor: true,
            earningsMinor: true,
            currency: true,
            status: true,
            paymentReference: true,
            createdAt: true,
            vendor: { select: { businessName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        this.db.feeReceivable.findMany({
          where: tenantWhere,
          select: {
            id: true,
            amountMinor: true,
            collectedMinor: true,
            currency: true,
            status: true,
            paymentReference: true,
            createdAt: true,
            vendor: { select: { businessName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      ]);
      return { ...base, classification: 'PROJECTED', settlements, receivables };
    }
    if (view === 'exceptions') {
      const [provisioning, receivables, reconciliationCases] =
        await Promise.all([
          this.db.vendorProvisioningSaga.findMany({
            where: {
              ...tenantWhere,
              status: {
                in: ['FAILED_RETRYABLE', 'MANUAL_REVIEW', 'RECONCILING'],
              },
            },
            select: {
              id: true,
              tenantId: true,
              status: true,
              attempts: true,
              lastErrorCode: true,
              lastRequestId: true,
              updatedAt: true,
              vendor: { select: { businessName: true } },
            },
            orderBy: { updatedAt: 'desc' },
            take: 100,
          }),
          this.db.feeReceivable.findMany({
            where: { ...tenantWhere, status: 'OUTSTANDING' },
            select: {
              id: true,
              amountMinor: true,
              collectedMinor: true,
              currency: true,
              createdAt: true,
              vendor: { select: { businessName: true } },
            },
            orderBy: { createdAt: 'asc' },
            take: 100,
          }),
          this.db.reconciliationCase.findMany({
            where: { ...tenantWhere, status: 'OPEN' },
            select: {
              id: true,
              category: true,
              severity: true,
              status: true,
              summary: true,
              sourceSystem: true,
              sourceReference: true,
              subjectType: true,
              subjectId: true,
              requestId: true,
              createdAt: true,
              updatedAt: true,
              vendor: { select: { businessName: true } },
            },
            orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
            take: 100,
          }),
        ]);
      return {
        ...base,
        classification: 'OPERATIONAL',
        provisioning,
        receivables,
        reconciliationCases,
      };
    }
    if (view === 'audit') {
      const events = await this.db.auditEvent.findMany({
        where: tenantWhere,
        select: {
          id: true,
          tenantId: true,
          actorId: true,
          action: true,
          subjectId: true,
          requestId: true,
          outcome: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return { ...base, classification: 'AUTHORITATIVE', events };
    }
    if (view === 'reviews') {
      const applications = await this.db.onboardingApplication.findMany({
        where: { ...tenantWhere, status: 'UNDER_REVIEW' },
        select: {
          id: true,
          tenantId: true,
          version: true,
          status: true,
          submittedAt: true,
          createdAt: true,
          vendor: { select: { businessName: true, type: true } },
        },
        orderBy: { submittedAt: 'asc' },
        take: 100,
      });
      return { ...base, classification: 'AUTHORITATIVE', applications };
    }
    const revisions = await this.db.dispatcherRevision.findMany({
      where: {
        status: 'UNDER_REVIEW',
        ...(scopedVendorIds?.length
          ? { dispatcher: { tenantId: { in: scopedVendorIds } } }
          : {}),
      },
      select: {
        id: true,
        version: true,
        status: true,
        firstName: true,
        lastName: true,
        engagementType: true,
        vehicleType: true,
        submittedAt: true,
        dispatcher: { select: { vendor: { select: { businessName: true } } } },
      },
      orderBy: { submittedAt: 'asc' },
      take: 100,
    });
    return { ...base, classification: 'AUTHORITATIVE', revisions };
  }
}
