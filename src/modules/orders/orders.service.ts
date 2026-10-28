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
import { MapsService } from '../../integrations/maps/maps.service.js';
import type { AddressDto } from '../pricing/pricing.dto.js';
import type {
  CreateCustomerOrderDto,
  CreateVendorOrderDto,
  OrderListQueryDto,
  PaymentWebhookDto,
} from './orders.dto.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AccountService } from '../account/account.service.js';

@Injectable()
export class OrdersService {
  constructor(
    private readonly db: PrismaService,
    private readonly payment: PaymentService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly account: AccountService,
    private readonly maps: MapsService,
    private readonly notifications?: NotificationsService,
  ) {}

  async list(tenantId: string, query: OrderListQueryDto) {
    const where: any = {
      tenantId,
      ...(query.source ? { source: query.source } : {}),
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
                itemDescription: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.order.findMany({
        where,
        include: {
          checkout: true,
          batchItem: { select: { batchId: true } },
          manifestItems: { select: { id: true } },
          dispatchItems: { select: { dispatchId: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.order.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async detail(tenantId: string, id: string) {
    const order = await this.db.order.findFirst({
      where: { id, tenantId },
      include: { checkout: true, quote: true, customer: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async resolveLocations(input: {
    pickup: AddressDto;
    delivery: AddressDto;
  }) {
    const [pickup, delivery] = await Promise.all([
      this.maps.resolveAddress({ ...input.pickup, country: 'NG' }),
      this.maps.resolveAddress({ ...input.delivery, country: 'NG' }),
    ]);
    return { pickup, delivery };
  }

  private orderData(input: CreateVendorOrderDto) {
    return {
      sender: input.sender as any,
      receiver: input.receiver as any,
      orderType: input.orderType,
      handling: input.handling,
      parcelMetadata: {
        category: input.orderType,
        description: input.itemDescription,
        handling: input.handling,
        declaredValue: input.declaredValue,
        dimensionsCm: {
          length: input.lengthCm,
          width: input.widthCm,
          height: input.heightCm,
        },
        weightKg: input.weightKg,
        quantity: input.quantity,
        inspectionConsent: input.inspectionConsent,
      } as any,
      itemDescription: input.itemDescription,
      deliveryStatus: input.deliveryStatus,
      scheduledStart: input.scheduledStart
        ? new Date(input.scheduledStart)
        : null,
      scheduledEnd: input.scheduledEnd ? new Date(input.scheduledEnd) : null,
      fragile: input.fragile,
      sizeEstimate: input.sizeEstimate,
      customerId: input.customerId,
      mobilityMethod: input.mobilityMethod,
    };
  }

  async createVendor(
    tenantId: string,
    actorId: string,
    key: string,
    input: CreateVendorOrderDto,
  ) {
    if (!key) throw new ConflictException('Idempotency-Key is required');
    const existing = await this.db.idempotencyRecord.findUnique({
      where: { scope_key: { scope: `vendor-order:${tenantId}`, key } },
    });
    if (existing) return existing.responseBody;
    if (
      input.customerId &&
      !(await this.db.customer.findFirst({
        where: { id: input.customerId, tenantId },
      }))
    )
      throw new NotFoundException('Customer not found');
    const quote = input.quoteReference
      ? await this.db.pricingQuote.findFirst({
          where: {
            tenantId,
            publicReference: input.quoteReference,
            consumedAt: null,
            expiresAt: { gt: new Date() },
          },
        })
      : null;
    if (input.quoteReference && !quote)
      throw new ConflictException('Quote is invalid or expired');
    const locations = await this.resolveLocations(input);
    const order = await this.db.$transaction(async (tx) => {
      const resolveCustomer = async (
        id: string | undefined,
        save: boolean | undefined,
        contact: { name: string; phone: string; email?: string },
      ) => {
        if (id) {
          const customer = await tx.customer.findFirst({
            where: { id, tenantId },
          });
          if (!customer)
            throw new ConflictException('Selected customer is unavailable');
          return customer;
        }
        if (!save) return null;
        const phone = contact.phone.trim();
        return tx.customer.upsert({
          where: { tenantId_phone: { tenantId, phone } },
          update: {
            name: contact.name.trim(),
            email: contact.email?.trim().toLowerCase(),
          },
          create: {
            tenantId,
            name: contact.name.trim(),
            phone,
            email: contact.email?.trim().toLowerCase(),
          },
        });
      };
      const senderCustomer = await resolveCustomer(
        input.senderCustomerId ?? input.customerId,
        input.saveSender,
        input.sender,
      );
      await resolveCustomer(
        input.receiverCustomerId,
        input.saveReceiver,
        input.receiver,
      );
      const created = await tx.order.create({
        data: {
          tenantId,
          publicReference: `O-${randomBytes(8).toString('hex').toUpperCase()}`,
          source: 'VENDOR_DIRECT',
          status: 'DRAFT',
          paymentStatus: 'NOT_REQUIRED',
          createdById: actorId,
          ...this.orderData(input),
          customerId: senderCustomer?.id,
          pickup: locations.pickup as any,
          delivery: locations.delivery as any,
          ...(quote
            ? {
                quoteId: quote.id,
                distanceMetres: quote.distanceMetres,
                durationSeconds: quote.durationSeconds,
                amountMinor: quote.finalAmountMinor,
                currency: quote.currency,
              }
            : {}),
        },
      });
      if (quote)
        await tx.pricingQuote.update({
          where: { id: quote.id },
          data: { consumedAt: new Date() },
        });
      await tx.idempotencyRecord.create({
        data: {
          scope: `vendor-order:${tenantId}`,
          key,
          actorId,
          requestHash: createHash('sha256')
            .update(JSON.stringify(input))
            .digest('hex'),
          responseStatus: 201,
          responseBody: created as any,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      return created;
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'order.created',
      subjectId: order.id,
    });
    return order;
  }

  async transition(
    tenantId: string,
    actorId: string,
    id: string,
    action: 'ready' | 'accept' | 'cancel',
    key: string,
  ) {
    if (!key) throw new ConflictException('Idempotency-Key is required');
    const scope = `order-transition:${tenantId}:${id}:${action}`;
    const replay = await this.db.idempotencyRecord.findUnique({
      where: { scope_key: { scope, key } },
    });
    if (replay) return replay.responseBody;
    const order = await this.db.order.findFirst({ where: { id, tenantId } });
    if (!order) throw new NotFoundException('Order not found');
    const allowed =
      (action === 'ready' &&
        order.source === 'VENDOR_DIRECT' &&
        order.status === 'DRAFT') ||
      (action === 'accept' &&
        order.source === 'CUSTOMER_LINK' &&
        order.status === 'PENDING_ACCEPTANCE' &&
        order.paymentStatus === 'PAID') ||
      (action === 'cancel' &&
        ['DRAFT', 'READY', 'PENDING_PAYMENT', 'PENDING_ACCEPTANCE'].includes(
          order.status,
        ));
    if (!allowed)
      throw new ConflictException('Order transition is not allowed');
    const status =
      action === 'ready'
        ? 'READY'
        : action === 'accept'
          ? 'ACCEPTED'
          : 'CANCELLED';
    const updated = await this.db.order.updateMany({
      where: { id, tenantId, status: order.status },
      data: {
        status: status as any,
        ...(action === 'accept' ? { acceptedAt: new Date() } : {}),
        ...(action === 'cancel' ? { cancelledAt: new Date() } : {}),
      },
    });
    if (updated.count !== 1)
      throw new ConflictException('Order changed concurrently');
    await this.audit.record({
      tenantId,
      actorId,
      action: `order.${action}`,
      subjectId: id,
    });
    const response = await this.detail(tenantId, id);
    await this.db.idempotencyRecord.create({
      data: {
        scope,
        key,
        actorId,
        requestHash: action,
        responseStatus: 200,
        responseBody: response as any,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    return response;
  }

  async createCustomer(
    slug: string,
    key: string,
    input: CreateCustomerOrderDto,
  ) {
    if (!key) throw new ConflictException('Idempotency-Key is required');
    const vendor = await this.db.vendor.findFirst({
      where: { publicSlug: slug, status: 'APPROVED' },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (!vendor.externalCheckoutUserId)
      throw new ConflictException('Vendor checkout is not configured');
    const quote = await this.db.pricingQuote.findFirst({
      where: {
        tenantId: vendor.id,
        publicReference: input.quoteReference,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!quote) throw new ConflictException('Quote is invalid or expired');
    const previous = await this.db.idempotencyRecord.findUnique({
      where: { scope_key: { scope: `public-order:${vendor.id}`, key } },
    });
    if (previous) return previous.responseBody;
    const reference = `O-${randomBytes(8).toString('hex').toUpperCase()}`;
    const checkout = await this.payment.createCheckout({
      userId: vendor.externalCheckoutUserId,
      amountMinor: quote.finalAmountMinor,
      idempotencyKey: key,
    });
    const locations = await this.resolveLocations(input);
    const order = await this.db.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          tenantId: vendor.id,
          publicReference: reference,
          source: 'CUSTOMER_LINK',
          status: 'PENDING_PAYMENT',
          paymentStatus: 'PENDING',
          quoteId: quote.id,
          distanceMetres: quote.distanceMetres,
          durationSeconds: quote.durationSeconds,
          amountMinor: quote.finalAmountMinor,
          ...this.orderData(input),
          pickup: locations.pickup as any,
          delivery: locations.delivery as any,
          customerId: null,
          checkout: { create: checkout },
        },
        include: { checkout: true },
      });
      await tx.pricingQuote.update({
        where: { id: quote.id },
        data: { consumedAt: new Date() },
      });
      await tx.idempotencyRecord.create({
        data: {
          scope: `public-order:${vendor.id}`,
          key,
          actorId: `public:${reference}`,
          requestHash: createHash('sha256')
            .update(JSON.stringify(input))
            .digest('hex'),
          responseStatus: 201,
          responseBody: created as any,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      return created;
    });
    return order;
  }

  async publicStatus(reference: string) {
    const order = await this.db.order.findUnique({
      where: { publicReference: reference },
      select: {
        publicReference: true,
        status: true,
        paymentStatus: true,
        amountMinor: true,
        currency: true,
        checkout: {
          select: {
            dynamicAccountNumber: true,
            bankName: true,
            expiresAt: true,
          },
        },
      },
    });
    if (!order || !order.checkout)
      throw new NotFoundException('Order not found');
    return order;
  }

  async mapPaymentAccount(
    tenantId: string,
    actorId: string,
    key: string,
    externalCheckoutUserId: string,
  ) {
    if (!key) throw new ConflictException('Idempotency-Key is required');
    const scope = `payment-account:${tenantId}`;
    const replay = await this.db.idempotencyRecord.findUnique({
      where: { scope_key: { scope, key } },
    });
    if (replay) return replay.responseBody;
    const vendor = await this.db.vendor.update({
      where: { id: tenantId },
      data: { externalCheckoutUserId },
      select: { id: true, externalCheckoutUserId: true },
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'vendor.payment_account_mapped',
      subjectId: tenantId,
    });
    await this.db.idempotencyRecord.create({
      data: {
        scope,
        key,
        actorId,
        requestHash: createHash('sha256')
          .update(externalCheckoutUserId)
          .digest('hex'),
        responseStatus: 200,
        responseBody: vendor,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    return vendor;
  }

  async paymentWebhook(
    timestamp: string,
    signature: string,
    keyId: string,
    body: PaymentWebhookDto,
  ) {
    const secret = this.config.get<string>('PEPSA_PAYMENT_WEBHOOK_SECRET');
    if (!secret) throw new ForbiddenException('Payment webhook is unavailable');
    const expectedKeyId = this.config.get<string>('PEPSA_PAYMENT_EVENT_KEY_ID');
    if (!expectedKeyId || keyId !== expectedKeyId)
      throw new UnauthorizedException('Payment webhook key is invalid');
    const expectedPlatformId = this.config.get<string>(
      'PEPSA_PAYMENT_PLATFORM_ID',
    );
    if (!expectedPlatformId || body.platformId !== expectedPlatformId)
      throw new UnauthorizedException('Payment webhook platform is invalid');
    const time = Number(timestamp);
    if (!Number.isFinite(time) || Math.abs(Date.now() - time) > 5 * 60 * 1000)
      throw new UnauthorizedException('Payment webhook timestamp is invalid');
    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${JSON.stringify(body)}`)
      .digest('hex');
    const supplied = Buffer.from(signature || '', 'hex');
    const wanted = Buffer.from(expected, 'hex');
    if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted))
      throw new UnauthorizedException('Payment webhook signature is invalid');
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(body))
      .digest('hex');
    const existing = await this.db.paymentWebhookEvent.findUnique({
      where: { eventId: body.eventId },
    });
    if (existing) {
      if (existing.payloadHash !== payloadHash)
        throw new ConflictException('Webhook event conflict');
      return { processed: true, duplicate: true };
    }
    if (body.eventType === 'wallet.credited') {
      const vendor = await this.db.vendor.findUnique({
        where: { externalCheckoutUserId: body.data.externalUserId },
      });
      if (!vendor)
        throw new NotFoundException('Vendor payment identity not found');
      await this.db.paymentWebhookEvent.create({
        data: {
          eventId: body.eventId,
          eventType: body.eventType,
          payloadHash,
          processedAt: new Date(),
        },
      });
      const collection = await this.account.reconcileFees(vendor.id);
      return { processed: true, duplicate: false, collection };
    }
    await this.db.$transaction(async (tx) => {
      const event = await tx.paymentWebhookEvent.create({
        data: { eventId: body.eventId, eventType: body.eventType, payloadHash },
      });
      const checkout = await tx.checkoutSession.findUnique({
        where: { providerCheckoutId: body.data.checkoutId! },
        include: { order: true },
      });
      if (!checkout) throw new NotFoundException('Checkout not found');
      const vendor = await tx.vendor.findUnique({
        where: { id: checkout.order.tenantId },
      });
      if (
        !vendor ||
        vendor.externalCheckoutUserId !== body.data.externalUserId ||
        body.data.currency !== checkout.order.currency ||
        body.data.amount !==
          ((checkout.order.amountMinor ?? 0) / 100).toFixed(2)
      )
        throw new ConflictException(
          'Payment event does not match the Vendor checkout snapshot',
        );
      if (body.eventType === 'checkout.paid') {
        await tx.order.updateMany({
          where: {
            id: checkout.orderId,
            status: 'PENDING_PAYMENT',
            paymentStatus: 'PENDING',
          },
          data: { status: 'PENDING_ACCEPTANCE', paymentStatus: 'PAID' },
        });
        await tx.vendorSettlementEntry.upsert({
          where: {
            tenantId_source_sourceReference: {
              tenantId: checkout.order.tenantId,
              source: 'CUSTOMER_LINK',
              sourceReference: checkout.order.publicReference,
            },
          },
          update: {
            status: 'COMPLETED',
            paymentReference: body.data.paymentReference ?? body.eventId,
            completedAt: new Date(),
          },
          create: {
            tenantId: checkout.order.tenantId,
            source: 'CUSTOMER_LINK',
            sourceReference: checkout.order.publicReference,
            counterpartyId: checkout.order.customerId,
            totalAmountMinor: checkout.order.amountMinor ?? 0,
            earningsMinor: checkout.order.amountMinor ?? 0,
            currency: checkout.order.currency,
            status: 'COMPLETED',
            paymentReference: body.eventId,
            completedAt: new Date(),
          },
        });
      } else {
        await tx.order.updateMany({
          where: {
            id: checkout.orderId,
            status: 'PENDING_PAYMENT',
            paymentStatus: 'PENDING',
          },
          data: {
            paymentStatus:
              body.eventType === 'checkout.expired' ? 'EXPIRED' : 'FAILED',
          },
        });
      }
      await tx.paymentWebhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });
    });
    if (body.eventType === 'checkout.paid') {
      const checkout = await this.db.checkoutSession.findUnique({
        where: { providerCheckoutId: body.data.checkoutId! },
        include: { order: true },
      });
      if (checkout)
        await this.notifications?.emit({
          tenantId: checkout.order.tenantId,
          permission: 'orders.read',
          type: 'CUSTOMER_ORDER_PAID',
          title: 'Customer order paid',
          body: `${checkout.order.publicReference} is ready for acceptance.`,
          href: '/open-dispatch?view=customer-orders',
          uniqueKey: `order:${checkout.order.id}:paid`,
          email: true,
        });
    }
    return { processed: true, duplicate: false };
  }

  async reconcileCheckout(checkoutId: string) {
    const local = await this.db.checkoutSession.findUnique({
      where: { providerCheckoutId: checkoutId },
      include: { order: true },
    });
    if (!local) return { outcome: 'NOT_FOUND' as const };
    const remote = await this.payment.checkout(checkoutId);
    const vendor = await this.db.vendor.findUniqueOrThrow({
      where: { id: local.order.tenantId },
    });
    const expectedAmount = ((local.order.amountMinor ?? 0) / 100).toFixed(2);
    const mismatch =
      remote.checkout_id !== checkoutId ||
      remote.user_id !== vendor.externalCheckoutUserId ||
      remote.currency !== local.order.currency ||
      remote.amount !== expectedAmount;
    if (mismatch) {
      await this.db.reconciliationCase.upsert({
        where: {
          category_sourceReference_subjectId: {
            category: 'CHECKOUT_SNAPSHOT_MISMATCH',
            sourceReference: checkoutId,
            subjectId: local.orderId,
          },
        },
        update: {
          actualSnapshot: {
            checkoutId: remote.checkout_id,
            userId: remote.user_id,
            amount: remote.amount,
            currency: remote.currency,
            status: remote.status,
          },
        },
        create: {
          tenantId: local.order.tenantId,
          category: 'CHECKOUT_SNAPSHOT_MISMATCH',
          severity: 'CRITICAL',
          sourceSystem: 'pepsa-payment',
          sourceReference: checkoutId,
          subjectType: 'ORDER',
          subjectId: local.orderId,
          summary: 'Payment checkout does not match the Vendor order snapshot',
          expectedSnapshot: {
            userId: vendor.externalCheckoutUserId,
            amount: expectedAmount,
            currency: local.order.currency,
          },
          actualSnapshot: {
            checkoutId: remote.checkout_id,
            userId: remote.user_id,
            amount: remote.amount,
            currency: remote.currency,
            status: remote.status,
          },
        },
      });
      return { outcome: 'EXCEPTION' as const };
    }
    if (!['paid', 'expired', 'failed'].includes(remote.status))
      return { outcome: 'NO_CHANGE' as const };
    const eventId = `reconciliation:${checkoutId}:${remote.status}:${remote.paid_at ?? 'none'}`;
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(remote))
      .digest('hex');
    await this.db.$transaction(async (tx) => {
      const inserted = await tx.paymentWebhookEvent.createMany({
        data: {
          eventId,
          eventType: `checkout.${remote.status}`,
          payloadHash,
          processedAt: new Date(),
        },
        skipDuplicates: true,
      });
      if (inserted.count !== 1) return;
      if (remote.status === 'paid') {
        await tx.order.updateMany({
          where: {
            id: local.orderId,
            status: 'PENDING_PAYMENT',
            paymentStatus: 'PENDING',
          },
          data: { status: 'PENDING_ACCEPTANCE', paymentStatus: 'PAID' },
        });
        await tx.vendorSettlementEntry.upsert({
          where: {
            tenantId_source_sourceReference: {
              tenantId: local.order.tenantId,
              source: 'CUSTOMER_LINK',
              sourceReference: local.order.publicReference,
            },
          },
          update: {
            status: 'COMPLETED',
            paymentReference: remote.provider_reference ?? eventId,
            completedAt: new Date(),
          },
          create: {
            tenantId: local.order.tenantId,
            source: 'CUSTOMER_LINK',
            sourceReference: local.order.publicReference,
            counterpartyId: local.order.customerId,
            totalAmountMinor: local.order.amountMinor ?? 0,
            earningsMinor: local.order.amountMinor ?? 0,
            currency: local.order.currency,
            status: 'COMPLETED',
            paymentReference: remote.provider_reference ?? eventId,
            completedAt: new Date(),
          },
        });
      } else {
        await tx.order.updateMany({
          where: {
            id: local.orderId,
            status: 'PENDING_PAYMENT',
            paymentStatus: 'PENDING',
          },
          data: {
            paymentStatus: remote.status === 'expired' ? 'EXPIRED' : 'FAILED',
          },
        });
      }
    });
    return { outcome: 'REPAIRED' as const, status: remote.status };
  }

  async reconcilePendingCheckouts(limit = 100) {
    const rows = await this.db.checkoutSession.findMany({
      where: { order: { status: 'PENDING_PAYMENT', paymentStatus: 'PENDING' } },
      select: { providerCheckoutId: true },
      orderBy: { createdAt: 'asc' },
      take: Math.min(100, Math.max(1, limit)),
    });
    const results = [];
    for (const row of rows) {
      try {
        results.push({
          checkoutId: row.providerCheckoutId,
          ...(await this.reconcileCheckout(row.providerCheckoutId)),
        });
      } catch {
        results.push({
          checkoutId: row.providerCheckoutId,
          outcome: 'UNAVAILABLE' as const,
        });
      }
    }
    return results;
  }
}
