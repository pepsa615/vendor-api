import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../core/database/prisma.service.js';
import { PaymentService } from '../../integrations/payment/payment.service.js';
import {
  DispatchFinancePort,
  DispatchProviderPort,
  RouteOptimizationPort,
} from '../../integrations/dispatch/dispatch-ports.js';
import type {
  CreateDispatchDto,
  DispatchListQueryDto,
  DispatchPreviewDto,
  DispatchProviderEventDto,
} from './dispatch.dto.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { FeesService } from '../fees/fees.service.js';
import { PricingService } from '../pricing/pricing.service.js';

const ACTIVE = ['PENDING_MATCH', 'PAIRED', 'PICKED_UP', 'DELIVERED'] as const;
const transitions: Record<string, readonly string[]> = {
  PENDING_MATCH: ['PAIRED', 'CANCELLED'],
  PAIRED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['DELIVERED'],
  DELIVERED: ['COMPLETED'],
};
export const canTransitionDispatch = (from: string, to: string) =>
  transitions[from]?.includes(to) ?? false;
export const suggestedPayout = (amountMinor: number, revenueShareBps: number) =>
  Math.round((amountMinor * revenueShareBps) / 10_000);
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class DispatchService {
  constructor(
    private readonly db: PrismaService,
    private readonly optimizer: RouteOptimizationPort,
    private readonly provider: DispatchProviderPort,
    private readonly finance: DispatchFinancePort,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly payment: PaymentService,
    private readonly fees: FeesService,
    private readonly pricing: PricingService,
    private readonly notifications?: NotificationsService,
  ) {}

  async preview(tenantId: string, actorId: string, input: DispatchPreviewDto) {
    const vendor = await this.db.vendor.findUnique({ where: { id: tenantId } });
    if (!vendor || vendor.status !== 'APPROVED')
      throw new ConflictException('Vendor is not operational');
    if (vendor.dispatchCreationFrozen)
      throw new ConflictException('New dispatch creation is frozen');
    if (Boolean(input.orderId) === Boolean(input.batchId))
      throw new ConflictException('Select exactly one order or batch');
    if (input.mode === 'OWN_FLEET' && !input.dispatcherId)
      throw new ConflictException('An own-fleet dispatcher is required');
    if (input.mode === 'GENERAL_POOL' && input.dispatcherId)
      throw new ConflictException(
        'General-pool dispatch cannot select a dispatcher',
      );
    if (input.mode === 'GENERAL_POOL' && !input.mobilityMethod)
      throw new ConflictException(
        'Select a mobility method before requesting an Open Dispatch quote',
      );

    const dispatcher = input.dispatcherId
      ? await this.db.dispatcher.findFirst({
          where: {
            id: input.dispatcherId,
            tenantId,
            status: 'APPROVED',
            availability: true,
          },
          include: { approvedRevision: true },
        })
      : null;
    if (input.dispatcherId && !dispatcher)
      throw new ConflictException('Dispatcher is not approved and available');

    const batch = input.batchId
      ? await this.db.batch.findFirst({
          where: { id: input.batchId, tenantId, dispatch: null },
          include: { items: { include: { order: true } } },
        })
      : null;
    const order = input.orderId
      ? await this.db.order.findFirst({
          where: { id: input.orderId, tenantId, dispatchItems: { none: {} } },
        })
      : null;
    if ((input.batchId && !batch) || (input.orderId && !order))
      throw new NotFoundException('Eligible dispatch source not found');
    const orders = batch ? batch.items.map((item) => item.order) : [order!];
    if (!orders.length || orders.some((item) => !this.eligible(item)))
      throw new ConflictException(
        'Source contains an order that is not dispatch-ready',
      );

    const pickupKeys = new Set(
      orders.map((item) => this.addressKey(item.pickup)),
    );
    if (pickupKeys.size !== 1)
      throw new ConflictException(
        'A batch dispatch must have exactly one pickup',
      );
    const pickup = orders[0]!.pickup as any;
    const optimized = await this.optimizer.optimize({
      pickup: this.routeAddress(pickup),
      deliveries: orders.map((item) => ({
        orderId: item.id,
        ...this.routeAddress(item.delivery as any),
      })),
    });
    const totalAmountMinor = orders.reduce(
      (sum, item) => sum + (item.amountMinor ?? 0),
      0,
    );
    const providerQuote =
      input.mode === 'GENERAL_POOL'
        ? await this.generalPoolQuote(
            tenantId,
            this.generalPoolDistanceMetres(orders, optimized.distanceMetres),
          )
        : null;
    const revenueShareBps = dispatcher?.approvedRevision
      ? Math.round(Number(dispatcher.approvedRevision.revenueSharePct) * 100)
      : null;
    const suggestedPayoutMinor = revenueShareBps
      ? suggestedPayout(totalAmountMinor, revenueShareBps)
      : null;
    const resolvedFee =
      input.mode === 'OWN_FLEET'
        ? await this.fees.resolve(
            'RUNWAY_DISPATCH',
            tenantId,
            totalAmountMinor,
            providerQuote?.currency ?? orders[0]!.currency,
          )
        : null;
    const feeAmountMinor = resolvedFee?.amountMinor ?? 0;
    const fundingRequiredMinor =
      input.mode === 'GENERAL_POOL'
        ? providerQuote!.amountMinor
        : feeAmountMinor;
    const payload = {
      ...input,
      pickup: this.routeAddress(pickup),
      orderIds: optimized.stops.map((stop) => stop.orderId),
      stops: optimized.stops,
      distanceMetres: optimized.distanceMetres,
      durationSeconds: optimized.durationSeconds,
      totalAmountMinor,
      revenueShareBps,
      suggestedPayoutMinor,
      feeAmountMinor,
      feePolicyVersionId: resolvedFee?.policy.id ?? null,
      feePolicySnapshot: resolvedFee?.snapshot ?? null,
      feeDeferralAllowed: resolvedFee?.deferralAllowed ?? false,
      fundingRequiredMinor,
      currency: providerQuote?.currency ?? orders[0]!.currency,
      providerQuoteExpiresAt:
        input.mode === 'GENERAL_POOL'
          ? new Date(Date.now() + 10 * 60_000).toISOString()
          : null,
      providerOrders: orders.map((item) => {
        const parcel = item.parcelMetadata as any;
        return {
          id: item.id,
          sender: item.sender,
          receiver: item.receiver,
          delivery: item.delivery,
          orderType: item.orderType,
          itemDescription: item.itemDescription,
          sizeEstimate: item.sizeEstimate,
          fragile: item.fragile,
          declaredValue: parcel?.declaredValue,
          deliveryStatus: item.deliveryStatus,
          scheduledStart: item.scheduledStart?.toISOString() ?? null,
          scheduledEnd: item.scheduledEnd?.toISOString() ?? null,
        };
      }),
    };
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    await this.db.dispatchPreview.create({
      data: {
        tokenHash: hash(token),
        tenantId,
        actorId,
        payload: payload as any,
        expiresAt,
      },
    });
    return { ...payload, previewToken: token, expiresAt };
  }

  async create(
    tenantId: string,
    actorId: string,
    key: string,
    input: CreateDispatchDto,
  ) {
    if (!key) throw new ConflictException('Idempotency-Key is required');
    const scope = `dispatch:create:${tenantId}`;
    const replay = await this.db.idempotencyRecord.findUnique({
      where: { scope_key: { scope, key } },
    });
    const requestHash = hash(JSON.stringify(input));
    if (replay) {
      if (replay.requestHash !== requestHash)
        throw new ConflictException(
          'Idempotency key was used with different input',
        );
      return replay.responseBody;
    }
    const preview = await this.db.dispatchPreview.findFirst({
      where: {
        tokenHash: hash(input.previewToken),
        tenantId,
        actorId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!preview)
      throw new ConflictException(
        'Preview is invalid, expired, or already used',
      );
    const payload = preview.payload as any;
    const stopPayouts = input.stopPayouts ?? [];
    const payoutAmountMinor =
      payload.mode === 'OWN_FLEET'
        ? (input.payoutAmountMinor ??
          (stopPayouts.length
            ? stopPayouts.reduce((sum, stop) => sum + stop.payoutAmountMinor, 0)
            : (payload.suggestedPayoutMinor ?? 0)))
        : null;
    if (input.payoutAmountMinor != null && stopPayouts.length)
      throw new ConflictException('Use either bulk payout or per-stop payouts');
    if (
      stopPayouts.length &&
      (stopPayouts.length !== payload.orderIds.length ||
        new Set(stopPayouts.map((stop) => stop.orderId)).size !==
          payload.orderIds.length ||
        payload.orderIds.some(
          (orderId: string) =>
            !stopPayouts.some((stop) => stop.orderId === orderId),
        ))
    )
      throw new ConflictException(
        'Per-stop payouts must cover every optimized stop',
      );

    // Stable across a timeout-before-local-commit retry. Payment and Pepsa
    // Order both use this reference in their idempotency scopes.
    const publicReference = `D-${hash(`${tenantId}:${key}`).slice(0, 12).toUpperCase()}`;
    const funding = await this.finance.reserve({
      tenantId,
      dispatchReference: publicReference,
      amountMinor: payload.fundingRequiredMinor,
      allowDeferred:
        payload.mode === 'OWN_FLEET' && payload.feeDeferralAllowed === true,
      chargeCode:
        payload.mode === 'OWN_FLEET'
          ? 'RUNWAY_DISPATCH'
          : 'GENERAL_POOL_DISPATCH',
    });
    const submitted = await this.provider.submit({
      dispatchReference: publicReference,
      mode: payload.mode,
      mobilityMethod: payload.mobilityMethod,
      dispatcherId: payload.dispatcherId,
      stops: payload.stops,
      paymentReference: funding.paymentReference,
      amountMinor: payload.fundingRequiredMinor,
      currency: payload.currency,
      quoteExpiresAt: payload.providerQuoteExpiresAt,
      pickup: payload.pickup,
      orders: payload.providerOrders,
    });
    try {
      const created = await this.db.$transaction(async (tx) => {
        const consumed = await tx.dispatchPreview.updateMany({
          where: {
            id: preview.id,
            consumedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { consumedAt: new Date() },
        });
        if (consumed.count !== 1)
          throw new ConflictException('Preview was used concurrently');
        const eligibleCount = await tx.order.count({
          where: {
            id: { in: payload.orderIds },
            tenantId,
            dispatchItems: { none: {} },
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
        if (eligibleCount !== payload.orderIds.length)
          throw new ConflictException('Preview is stale; create a new preview');
        const dispatch = await tx.dispatch.create({
          data: {
            publicReference,
            tenantId,
            mode: payload.mode,
            batchId: payload.batchId,
            dispatcherId: payload.dispatcherId,
            providerReference: submitted.providerReference,
            currency: payload.currency,
            revenueShareBps: payload.revenueShareBps,
            payoutAmountMinor,
            feeAmountMinor: payload.feeAmountMinor,
            feePolicyVersionId: payload.feePolicyVersionId,
            feePolicySnapshot: payload.feePolicySnapshot,
            fundingRequiredMinor: payload.fundingRequiredMinor,
            optimizedDistanceMetres: payload.distanceMetres,
            optimizedDurationSeconds: payload.durationSeconds,
            routeSnapshot: { pickup: payload.pickup, stops: payload.stops },
            createdById: actorId,
            items: {
              create: payload.orderIds.map(
                (orderId: string, index: number) => ({
                  orderId,
                  stopSequence: index + 1,
                  payoutAmountMinor:
                    stopPayouts.find((stop) => stop.orderId === orderId)
                      ?.payoutAmountMinor ??
                    (payload.orderIds.length === 1 ? payoutAmountMinor : null),
                }),
              ),
            },
            events: {
              create: {
                actorId,
                toStatus: 'PENDING_MATCH',
                source: 'VENDOR',
              },
            },
          },
          include: this.detailInclude(),
        });
        if (payload.feeAmountMinor > 0 && payload.feePolicySnapshot) {
          const assessment = await tx.feeAssessment.create({
            data: {
              tenantId,
              feeCode: 'RUNWAY_DISPATCH',
              sourceType: 'DISPATCH',
              sourceReference: dispatch.id,
              policyVersionId: payload.feePolicyVersionId,
              policySnapshot: payload.feePolicySnapshot,
              assessedAmountMinor: payload.feeAmountMinor,
              collectedAmountMinor: funding.deferred
                ? 0
                : payload.feeAmountMinor,
              currency: payload.currency,
            },
          });
          if (!funding.deferred && funding.paymentReference) {
            await tx.feeCollectionPortion.create({
              data: {
                tenantId,
                assessmentId: assessment.id,
                sequence: 0,
                amountMinor: payload.feeAmountMinor,
                currency: payload.currency,
                paymentTransactionId: funding.paymentReference,
                idempotencyKey: `fee-immediate:${dispatch.id}`,
              },
            });
          }
        }
        if (funding.deferred && payload.feeAmountMinor > 0) {
          await tx.feeReceivable.create({
            data: {
              tenantId,
              dispatchId: dispatch.id,
              amountMinor: payload.feeAmountMinor,
              currency: payload.currency,
            },
          });
        }
        await tx.idempotencyRecord.create({
          data: {
            scope,
            key,
            actorId,
            requestHash,
            responseStatus: 201,
            responseBody: dispatch as any,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        });
        return dispatch;
      });
      await this.audit.record({
        tenantId,
        actorId,
        action: 'dispatch.created',
        subjectId: created.id,
      });
      return created;
    } catch (error) {
      await this.provider
        .cancel(submitted.providerReference)
        .catch(() => undefined);
      throw error;
    }
  }

  async list(tenantId: string, query: DispatchListQueryDto) {
    const where: any = {
      tenantId,
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.mode ? { mode: query.mode } : {}),
      ...(query.source
        ? { items: { some: { order: { source: query.source } } } }
        : {}),
      status: query.status
        ? query.status
        : query.view === 'active'
          ? { in: [...ACTIVE] }
          : { in: ['DELIVERED', 'COMPLETED', 'CANCELLED'] },
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
                items: {
                  some: {
                    order: {
                      publicReference: {
                        contains: query.search,
                        mode: 'insensitive',
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.dispatch.findMany({
        where,
        include: this.listInclude(),
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.dispatch.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async detail(tenantId: string, id: string) {
    const dispatch = await this.db.dispatch.findFirst({
      where: { id, tenantId },
      include: this.detailInclude(),
    });
    if (!dispatch) throw new NotFoundException('Dispatch not found');
    return dispatch;
  }

  async openDispatchPrice(
    tenantId: string,
    id: string,
    mobilityMethod: string,
  ) {
    const dispatch = await this.db.dispatch.findFirst({
      where: { id, tenantId },
      include: { items: { include: { order: true } } },
    });
    if (!dispatch) throw new NotFoundException('Runway manifest not found');
    if (dispatch.mode !== 'OWN_FLEET' || dispatch.status !== 'PENDING_MATCH')
      throw new ConflictException(
        'Only an unpaired runway manifest can be pushed to Open Dispatch',
      );
    const quote = await this.generalPoolQuote(
      tenantId,
      dispatch.optimizedDistanceMetres,
    );
    return {
      dispatchId: dispatch.id,
      publicReference: dispatch.publicReference,
      amountMinor: quote.amountMinor,
      currency: quote.currency,
      mobilityMethod,
      distanceMetres: dispatch.optimizedDistanceMetres,
      durationSeconds: dispatch.optimizedDurationSeconds,
      itemCount: dispatch.items.length,
      irreversible: true,
    };
  }

  async publishToOpenDispatch(
    tenantId: string,
    actorId: string,
    id: string,
    key: string,
    mobilityMethod: string,
  ) {
    if (!key) throw new ConflictException('Idempotency-Key is required');
    const scope = `dispatch:publish-open:${tenantId}:${id}`;
    const replay = await this.db.idempotencyRecord.findUnique({
      where: { scope_key: { scope, key } },
    });
    if (replay) return replay.responseBody;
    const price = await this.openDispatchPrice(tenantId, id, mobilityMethod);
    const dispatch = await this.detail(tenantId, id);
    const providerReference = `OD-${dispatch.publicReference}`;
    const funding = await this.finance.reserve({
      tenantId,
      dispatchReference: providerReference,
      amountMinor: price.amountMinor,
      allowDeferred: false,
      chargeCode: 'GENERAL_POOL_DISPATCH',
    });
    const submitted = await this.provider.submit({
      dispatchReference: providerReference,
      mode: 'GENERAL_POOL',
      mobilityMethod,
      stops: (dispatch.routeSnapshot as any).stops,
      paymentReference: funding.paymentReference,
      amountMinor: price.amountMinor,
      currency: price.currency,
      pickup: (dispatch.routeSnapshot as any).pickup,
      orders: dispatch.items.map(({ order }) => {
        const parcel = order.parcelMetadata as any;
        return {
          id: order.id,
          sender: order.sender as Record<string, unknown>,
          receiver: order.receiver as Record<string, unknown>,
          delivery: order.delivery as Record<string, unknown>,
          orderType: order.orderType,
          itemDescription: order.itemDescription,
          sizeEstimate: order.sizeEstimate,
          fragile: order.fragile,
          declaredValue: parcel?.declaredValue,
          deliveryStatus: order.deliveryStatus,
          scheduledStart: order.scheduledStart?.toISOString() ?? null,
          scheduledEnd: order.scheduledEnd?.toISOString() ?? null,
        };
      }),
    });
    try {
      const updated = await this.db.$transaction(async (tx) => {
        const changed = await tx.dispatch.updateMany({
          where: { id, tenantId, mode: 'OWN_FLEET', status: 'PENDING_MATCH' },
          data: {
            mode: 'GENERAL_POOL',
            dispatcherId: null,
            providerReference: submitted.providerReference,
            fundingRequiredMinor: price.amountMinor,
            currency: price.currency,
            payoutAmountMinor: null,
            revenueShareBps: null,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1)
          throw new ConflictException('Runway manifest changed concurrently');
        await tx.dispatchEvent.create({
          data: {
            dispatchId: id,
            actorId,
            fromStatus: 'PENDING_MATCH',
            toStatus: 'PENDING_MATCH',
            source: 'OPEN_DISPATCH_PUBLISH',
            message: 'Irreversibly published to the Pepsa general pool',
          },
        });
        const response = await tx.dispatch.findUniqueOrThrow({
          where: { id },
          include: this.detailInclude(),
        });
        await tx.idempotencyRecord.create({
          data: {
            scope,
            key,
            actorId,
            requestHash: hash(JSON.stringify({ id })),
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
        action: 'dispatch.published_to_open_dispatch',
        subjectId: id,
        metadata: { amountMinor: price.amountMinor },
      });
      return updated;
    } catch (error) {
      await this.provider
        .cancel(submitted.providerReference)
        .catch(() => undefined);
      throw error;
    }
  }

  async summary(
    tenantId: string,
    view: 'active' | 'history' = 'active',
    mode?: 'OWN_FLEET' | 'GENERAL_POOL',
  ) {
    const active = await this.db.dispatch.findMany({
      where: {
        tenantId,
        ...(mode ? { mode } : {}),
        status: {
          in:
            view === 'active'
              ? [...ACTIVE]
              : ['DELIVERED', 'COMPLETED', 'CANCELLED'],
        },
      },
      include: {
        items: { include: { order: { select: { amountMinor: true } } } },
        dispatcher: true,
      },
    });
    const statusCounts = await this.db.dispatch.groupBy({
      where: {
        tenantId,
        ...(mode ? { mode } : {}),
        status: {
          in:
            view === 'active'
              ? [...ACTIVE]
              : ['DELIVERED', 'COMPLETED', 'CANCELLED'],
        },
      },
      by: ['status'],
      _count: { _all: true },
    });
    const settlement =
      view === 'history'
        ? await this.db.vendorSettlementEntry.aggregate({
            where: { tenantId, status: 'COMPLETED' },
            _sum: { earningsMinor: true, totalAmountMinor: true },
          })
        : null;
    return {
      totalDispatch: active.reduce((sum, item) => sum + item.items.length, 0),
      activeBatches: active.filter((item) => item.batchId).length,
      activeDispatchers: new Set(
        active.flatMap((item) =>
          item.dispatcherId ? [item.dispatcherId] : [],
        ),
      ).size,
      totalRevenueMinor: active.reduce(
        (sum, dispatch) =>
          sum +
          dispatch.items.reduce(
            (inner, item) => inner + (item.order.amountMinor ?? 0),
            0,
          ),
        0,
      ),
      totalEarningsMinor: settlement?._sum.earningsMinor ?? 0,
      statusCounts,
      currency: 'NGN',
    };
  }

  async tracking(tenantId: string, id: string) {
    const dispatch = await this.detail(tenantId, id);
    return {
      id: dispatch.id,
      publicReference: dispatch.publicReference,
      status: dispatch.status,
      route: dispatch.routeSnapshot,
      events: dispatch.events,
      trackingPoints: dispatch.trackingPoints,
      latestLocation: dispatch.trackingPoints[0] ?? null,
    };
  }

  async cancel(tenantId: string, actorId: string, id: string, key: string) {
    if (!key) throw new ConflictException('Idempotency-Key is required');
    const dispatch = await this.db.dispatch.findFirst({
      where: { id, tenantId },
    });
    if (!dispatch) throw new NotFoundException('Dispatch not found');
    if (dispatch.status !== 'PENDING_MATCH')
      throw new ConflictException(
        'Only a pending match can be cancelled by the vendor',
      );
    const scope = `dispatch:${id}:cancel`;
    const replay = await this.db.idempotencyRecord.findUnique({
      where: { scope_key: { scope, key } },
    });
    if (replay) return replay.responseBody;
    if (dispatch.providerReference)
      await this.provider.cancel(dispatch.providerReference);
    return this.transition(
      dispatch,
      'CANCELLED',
      actorId,
      'VENDOR',
      undefined,
      key,
    );
  }

  async providerEvent(
    timestamp: string,
    signature: string,
    input: DispatchProviderEventDto,
  ) {
    this.verifySignature(timestamp, signature, input);
    const payloadHash = hash(JSON.stringify(input));
    const prior = await this.db.dispatchProviderEvent.findUnique({
      where: { eventId: input.eventId },
    });
    if (prior) {
      if (prior.payloadHash !== payloadHash)
        throw new ConflictException('Event ID payload mismatch');
      return { accepted: true, duplicate: true };
    }
    const dispatch = await this.db.dispatch.findUnique({
      where: { providerReference: input.providerReference },
    });
    if (!dispatch)
      throw new NotFoundException('Dispatch provider reference not found');
    const occurredAt = new Date(input.occurredAt);
    if (
      input.type !== 'LOCATION' &&
      !canTransitionDispatch(dispatch.status, input.type)
    )
      throw new ConflictException(
        `Cannot move dispatch from ${dispatch.status} to ${input.type}`,
      );
    if (input.type === 'LOCATION') {
      const latest = await this.db.dispatchTrackingPoint.findFirst({
        where: { dispatchId: dispatch.id },
        orderBy: { recordedAt: 'desc' },
      });
      if (latest && latest.recordedAt >= occurredAt)
        throw new ConflictException('Location event is stale');
    }
    if (input.type === 'LOCATION') {
      if (!input.location)
        throw new ConflictException('Location event requires coordinates');
      const location = input.location;
      await this.db.$transaction(async (tx) => {
        await tx.dispatchProviderEvent.create({
          data: {
            eventId: input.eventId,
            payloadHash,
            occurredAt,
            processedAt: new Date(),
          },
        });
        await tx.dispatchTrackingPoint.create({
          data: {
            dispatchId: dispatch.id,
            ...location,
            recordedAt: occurredAt,
          },
        });
      });
      return { accepted: true };
    }
    const timestampField: Record<string, string> = {
      PAIRED: 'pairedAt',
      PICKED_UP: 'pickedUpAt',
      DELIVERED: 'deliveredAt',
      COMPLETED: 'completedAt',
      CANCELLED: 'cancelledAt',
    };
    await this.db.$transaction(async (tx) => {
      await tx.dispatchProviderEvent.create({
        data: { eventId: input.eventId, payloadHash, occurredAt },
      });
      const updated = await tx.dispatch.updateMany({
        where: {
          id: dispatch.id,
          status: dispatch.status,
          version: dispatch.version,
        },
        data: {
          status: input.type as any,
          version: { increment: 1 },
          [timestampField[input.type]!]: occurredAt,
        },
      });
      if (updated.count !== 1)
        throw new ConflictException('Dispatch changed concurrently');
      await tx.dispatchEvent.create({
        data: {
          dispatchId: dispatch.id,
          actorId: 'dispatch-provider',
          fromStatus: dispatch.status,
          toStatus: input.type as any,
          source: 'PROVIDER',
          message: input.message,
          createdAt: occurredAt,
        },
      });
      await tx.dispatchProviderEvent.update({
        where: { eventId: input.eventId },
        data: { processedAt: new Date() },
      });
    });
    if (input.type === 'COMPLETED') {
      await this.recordSettlement(dispatch.id);
      await this.notifications?.emit({
        tenantId: dispatch.tenantId,
        permission: 'operations.read',
        type: 'DISPATCH_COMPLETED',
        title: 'Dispatch completed',
        body: `${dispatch.publicReference} has been completed.`,
        href: '/operations?view=delivery-report',
        uniqueKey: `dispatch:${dispatch.id}:completed`,
        email: true,
      });
    }
    if (input.type === 'CANCELLED')
      await this.notifications?.emit({
        tenantId: dispatch.tenantId,
        permission: 'operations.read',
        type: 'DISPATCH_EXCEPTION',
        title: 'Dispatch cancelled',
        body: `${dispatch.publicReference} was cancelled.`,
        href: '/operations?view=delivery-report',
        uniqueKey: `dispatch:${dispatch.id}:cancelled`,
        email: true,
      });
    return { accepted: true };
  }

  private async recordSettlement(dispatchId: string) {
    const dispatch = await this.db.dispatch.findUnique({
      where: { id: dispatchId },
      include: {
        items: { include: { order: true } },
        dispatcher: { include: { approvedRevision: true } },
        vendor: true,
      },
    });
    if (!dispatch || dispatch.mode !== 'OWN_FLEET') return;
    const total = dispatch.items.reduce(
      (sum, item) => sum + (item.order.amountMinor ?? 0),
      0,
    );
    const earnings = Math.max(0, total - (dispatch.payoutAmountMinor ?? 0));
    const entry = await this.db.vendorSettlementEntry.upsert({
      where: {
        tenantId_source_sourceReference: {
          tenantId: dispatch.tenantId,
          source: 'RIDER_FULFILLED',
          sourceReference: dispatch.publicReference,
        },
      },
      update: {},
      create: {
        tenantId: dispatch.tenantId,
        source: 'RIDER_FULFILLED',
        sourceReference: dispatch.publicReference,
        counterpartyId: dispatch.dispatcherId,
        counterpartyName: dispatch.dispatcher?.approvedRevision
          ? `${dispatch.dispatcher.approvedRevision.firstName} ${dispatch.dispatcher.approvedRevision.lastName}`
          : null,
        totalAmountMinor: total,
        earningsMinor: earnings,
        currency: dispatch.currency,
      },
    });
    if (!dispatch.vendor.externalCheckoutUserId || earnings === 0) return;
    try {
      const result = await this.payment.settlementCredit(
        {
          external_user_id: dispatch.tenantId,
          amount: (earnings / 100).toFixed(2),
          currency: dispatch.currency,
          source_reference: dispatch.publicReference,
          source_type: 'rider_fulfilled',
          metadata: { dispatchId: dispatch.id },
        },
        `dispatch-settlement:${dispatch.id}`,
      );
      await this.db.vendorSettlementEntry.update({
        where: { id: entry.id },
        data: {
          status: 'COMPLETED',
          paymentReference: result.entry_id,
          completedAt: new Date(),
        },
      });
    } catch {
      await this.db.vendorSettlementEntry.update({
        where: { id: entry.id },
        data: { status: 'FAILED' },
      });
    }
  }

  private async transition(
    dispatch: any,
    next: string,
    actorId: string,
    source: string,
    message?: string,
    key?: string,
  ) {
    if (!canTransitionDispatch(dispatch.status, next))
      throw new ConflictException(
        `Cannot move dispatch from ${dispatch.status} to ${next}`,
      );
    const timestampField: Record<string, string> = {
      PAIRED: 'pairedAt',
      PICKED_UP: 'pickedUpAt',
      DELIVERED: 'deliveredAt',
      COMPLETED: 'completedAt',
      CANCELLED: 'cancelledAt',
    };
    return this.db.$transaction(async (tx) => {
      const updated = await tx.dispatch.updateMany({
        where: {
          id: dispatch.id,
          status: dispatch.status,
          version: dispatch.version,
        },
        data: {
          status: next as any,
          version: { increment: 1 },
          [timestampField[next]!]: new Date(),
        },
      });
      if (updated.count !== 1)
        throw new ConflictException('Dispatch changed concurrently');
      await tx.dispatchEvent.create({
        data: {
          dispatchId: dispatch.id,
          actorId,
          fromStatus: dispatch.status,
          toStatus: next as any,
          source,
          message,
        },
      });
      const response = await tx.dispatch.findUniqueOrThrow({
        where: { id: dispatch.id },
        include: this.detailInclude(),
      });
      if (key && source === 'VENDOR') {
        await tx.idempotencyRecord.create({
          data: {
            scope: `dispatch:${dispatch.id}:cancel`,
            key,
            actorId,
            requestHash: hash(next),
            responseStatus: 200,
            responseBody: response as any,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        });
      }
      return response;
    });
  }

  private verifySignature(
    timestamp: string,
    signature: string,
    input: unknown,
  ) {
    const parsed = Number(timestamp);
    if (
      !Number.isFinite(parsed) ||
      Math.abs(Date.now() - parsed * 1000) > 300_000
    )
      throw new UnauthorizedException('Invalid dispatch event timestamp');
    const secret = this.config.get<string>('DISPATCH_WEBHOOK_SECRET');
    if (!secret)
      throw new ForbiddenException('Dispatch webhook is not configured');
    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${JSON.stringify(input)}`)
      .digest('hex');
    const supplied = signature?.replace(/^sha256=/, '') ?? '';
    if (
      expected.length !== supplied.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
    )
      throw new UnauthorizedException('Invalid dispatch event signature');
  }

  private generalPoolDistanceMetres(
    orders: Array<{ distanceMetres?: number | null }>,
    optimizedDistanceMetres: number,
  ) {
    if (orders.length === 1 && orders[0]?.distanceMetres)
      return orders[0].distanceMetres;
    return optimizedDistanceMetres;
  }

  private async generalPoolQuote(tenantId: string, distanceMetres: number) {
    const priced = await this.pricing.quoteAmountForDistance(
      tenantId,
      distanceMetres,
    );
    return { amountMinor: priced.amountMinor, currency: priced.currency };
  }

  private eligible(order: any) {
    return (
      (order.source === 'VENDOR_DIRECT' && order.status === 'READY') ||
      (order.source === 'CUSTOMER_LINK' &&
        order.status === 'ACCEPTED' &&
        order.paymentStatus === 'PAID')
    );
  }
  private addressKey(value: unknown) {
    const address = value as any;
    return [address.address, address.city, address.state]
      .map((item) =>
        String(item ?? '')
          .trim()
          .toLowerCase(),
      )
      .join('|');
  }
  private routeAddress(address: any) {
    return {
      address: [address.address, address.city, address.state]
        .filter(Boolean)
        .join(', '),
      ...(Number.isFinite(address.latitude)
        ? { latitude: address.latitude }
        : {}),
      ...(Number.isFinite(address.longitude)
        ? { longitude: address.longitude }
        : {}),
    };
  }
  private listInclude() {
    return {
      dispatcher: { include: { approvedRevision: true } },
      items: {
        orderBy: { stopSequence: 'asc' as const },
        include: { order: true },
      },
    };
  }
  private detailInclude() {
    return {
      ...this.listInclude(),
      events: { orderBy: { createdAt: 'asc' as const } },
      trackingPoints: { orderBy: { recordedAt: 'desc' as const }, take: 1 },
    };
  }
}
