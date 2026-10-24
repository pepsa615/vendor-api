import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { OrdersService } from './orders.service.js';
import type { PaymentWebhookDto } from './orders.dto.js';

const secret = 'test-event-secret';
const platformId = '11111111-1111-4111-8111-111111111111';
const body = {
  eventId: '22222222-2222-4222-8222-222222222222',
  eventType: 'checkout.paid' as const,
  schemaVersion: 1,
  occurredAt: new Date().toISOString(),
  platformId,
  aggregateType: 'checkout',
  aggregateId: 'checkout-1',
  data: {
    checkoutId: 'checkout-1',
    externalUserId: 'vendor-payment-1',
    amount: '10.00',
    currency: 'NGN',
  },
};

function service(db: object, payment: object = {}) {
  return new OrdersService(
    db as never,
    payment as never,
    {
      get: (key: string) =>
        ({
          PEPSA_PAYMENT_WEBHOOK_SECRET: secret,
          PEPSA_PAYMENT_EVENT_KEY_ID: 'key-1',
          PEPSA_PAYMENT_PLATFORM_ID: platformId,
        })[key],
    } as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

function signed(value: object = body, timestamp = String(Date.now())) {
  return {
    timestamp,
    signature: createHmac('sha256', secret)
      .update(`${timestamp}.${JSON.stringify(value)}`)
      .digest('hex'),
  };
}

describe('Payment event failure safety', () => {
  it('deduplicates an identical delivery without applying value again', async () => {
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(body))
      .digest('hex');
    const tx = vi.fn();
    const { timestamp, signature } = signed();
    await expect(
      service({
        paymentWebhookEvent: {
          findUnique: vi.fn().mockResolvedValue({ payloadHash }),
        },
        $transaction: tx,
      }).paymentWebhook(timestamp, signature, 'key-1', body),
    ).resolves.toEqual({ processed: true, duplicate: true });
    expect(tx).not.toHaveBeenCalled();
  });

  it('quarantines conflicting reuse of an event ID', async () => {
    const { timestamp, signature } = signed();
    await expect(
      service({
        paymentWebhookEvent: {
          findUnique: vi.fn().mockResolvedValue({ payloadHash: 'different' }),
        },
      }).paymentWebhook(timestamp, signature, 'key-1', body),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects delayed deliveries outside the replay window', async () => {
    const delayed = String(Date.now() - 10 * 60_000);
    const { signature } = signed(body, delayed);
    await expect(
      service({}).paymentWebhook(delayed, signature, 'key-1', body),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('cannot move a paid order backward when an expired event is reordered', async () => {
    const expired: PaymentWebhookDto = {
      ...body,
      eventId: '33333333-3333-4333-8333-333333333333',
      eventType: 'checkout.expired' as const,
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const tx = {
      paymentWebhookEvent: {
        create: vi.fn().mockResolvedValue({ id: 'inbox-1' }),
        update: vi.fn(),
      },
      checkoutSession: {
        findUnique: vi.fn().mockResolvedValue({
          orderId: 'order-1',
          order: {
            id: 'order-1',
            tenantId: 'tenant-1',
            paymentStatus: 'PAID',
            currency: 'NGN',
            amountMinor: 1000,
          },
        }),
      },
      vendor: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ externalCheckoutUserId: 'vendor-payment-1' }),
      },
      order: { updateMany },
    };
    const db = {
      paymentWebhookEvent: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const { timestamp, signature } = signed(expired);
    await service(db).paymentWebhook(timestamp, signature, 'key-1', expired);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ paymentStatus: 'PENDING' }),
      }),
    );
  });

  it('turns a lost delivery with a value mismatch into an exception', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const result = await service(
      {
        checkoutSession: {
          findUnique: vi.fn().mockResolvedValue({
            providerCheckoutId: 'checkout-1',
            order: { tenantId: 'tenant-1', currency: 'NGN', amountMinor: 1000 },
          }),
        },
        vendor: {
          findUniqueOrThrow: vi
            .fn()
            .mockResolvedValue({ externalCheckoutUserId: 'vendor-payment-1' }),
        },
        reconciliationCase: { upsert },
      },
      {
        checkout: vi.fn().mockResolvedValue({
          checkout_id: 'checkout-1',
          user_id: 'vendor-payment-1',
          amount: '11.00',
          currency: 'NGN',
          status: 'paid',
          paid_at: new Date().toISOString(),
          provider_reference: 'provider-1',
        }),
      },
    ).reconcileCheckout('checkout-1');
    expect(result.outcome).toBe('EXCEPTION');
    expect(upsert).toHaveBeenCalledOnce();
  });
});
