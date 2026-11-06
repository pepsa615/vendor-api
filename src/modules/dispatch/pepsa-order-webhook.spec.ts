import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { PepsaOrderWebhookDto } from './dispatch.dto.js';
import {
  DispatchService,
  mapPepsaOrderEventToProvider,
} from './dispatch.service.js';

const secret = 'pepsa-order-webhook-secret-32chars!!';

const baseBody = (): PepsaOrderWebhookDto => ({
  id: '11111111-1111-4111-8111-111111111111',
  type: 'dispatch.assigned',
  version: 1,
  aggregateId: 'shipment-ref-1',
  occurredAt: new Date().toISOString(),
  correlationId: 'corr-1',
  data: {
    shipmentId: 'shipment-ref-1',
    externalReference: 'D-ABC',
    status: 'DISPATCHED',
    assignedRiderExternalId: '146eabab-1111-4111-8111-111111111111',
  },
});

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function signed(body: PepsaOrderWebhookDto, timestamp = String(Math.floor(Date.now() / 1000))) {
  return {
    timestamp,
    signature: createHmac('sha256', secret)
      .update(`${timestamp}.`)
      .update(stableJson(body))
      .digest('hex'),
  };
}

function service(db: object) {
  return new DispatchService(
    db as never,
    {} as never,
    {} as never,
    {} as never,
    {
      get: (key: string) =>
        ({ PEPSA_ORDER_WEBHOOK_SECRET: secret })[key],
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('mapPepsaOrderEventToProvider', () => {
  it('maps dispatch.assigned to PAIRED using shipmentId', () => {
    expect(mapPepsaOrderEventToProvider(baseBody())).toEqual({
      eventId: '11111111-1111-4111-8111-111111111111',
      providerReference: 'shipment-ref-1',
      type: 'PAIRED',
      occurredAt: expect.any(String),
      message: 'dispatch.assigned',
    });
  });

  it('maps lifecycle events and ignores unknown types', () => {
    expect(
      mapPepsaOrderEventToProvider({
        ...baseBody(),
        type: 'pickup.confirmed',
      })?.type,
    ).toBe('PICKED_UP');
    expect(
      mapPepsaOrderEventToProvider({
        ...baseBody(),
        type: 'delivery.confirmed',
      })?.type,
    ).toBe('DELIVERED');
    expect(
      mapPepsaOrderEventToProvider({
        ...baseBody(),
        type: 'delivery.completed',
      })?.type,
    ).toBe('COMPLETED');
    expect(
      mapPepsaOrderEventToProvider({
        ...baseBody(),
        type: 'cancellation.confirmed',
      })?.type,
    ).toBe('CANCELLED');
    expect(
      mapPepsaOrderEventToProvider({
        ...baseBody(),
        type: 'tracking.updated',
      }),
    ).toBeNull();
  });
});

describe('DispatchService.pepsaOrderEvent', () => {
  it('ignores unmapped event types after signature verification', async () => {
    const body = { ...baseBody(), type: 'tracking.updated' };
    const { timestamp, signature } = signed(body);
    await expect(
      service({
        dispatch: { findFirst: vi.fn().mockResolvedValue(null) },
      }).pepsaOrderEvent(timestamp, signature, body),
    ).resolves.toEqual({ accepted: true, ignored: true });
  });

  it('heals PENDING_MATCH to PAIRED when tracking.updated arrives after a missed assign', async () => {
    const body = { ...baseBody(), type: 'tracking.updated' };
    const { timestamp, signature } = signed(body);
    const dispatch = {
      id: 'dispatch-1',
      tenantId: 'tenant-1',
      publicReference: 'D-ABC',
      status: 'PENDING_MATCH',
      providerReference: 'shipment-ref-1',
      version: 1,
    };
    const tx = vi.fn(async (fn: (client: object) => Promise<unknown>) =>
      fn({
        dispatchProviderEvent: { create: vi.fn(), update: vi.fn() },
        dispatch: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        dispatchEvent: { create: vi.fn() },
        order: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }),
    );
    await expect(
      service({
        dispatchProviderEvent: { findUnique: vi.fn().mockResolvedValue(null) },
        dispatch: {
          findFirst: vi.fn().mockResolvedValue(dispatch),
          findUnique: vi.fn().mockResolvedValue(dispatch),
        },
        $transaction: tx,
      }).pepsaOrderEvent(timestamp, signature, body),
    ).resolves.toEqual({ accepted: true });
    expect(tx).toHaveBeenCalled();
  });

  it('rejects invalid signatures', async () => {
    const body = baseBody();
    const { timestamp } = signed(body);
    await expect(
      service({}).pepsaOrderEvent(timestamp, '0'.repeat(64), body),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('applies dispatch.assigned as PAIRED against providerReference', async () => {
    const body = baseBody();
    const { timestamp, signature } = signed(body);
    const dispatch = {
      id: 'dispatch-1',
      tenantId: 'tenant-1',
      publicReference: 'D-ABC',
      status: 'PENDING_MATCH',
      version: 1,
    };
    const tx = vi.fn(async (fn: (client: object) => Promise<unknown>) =>
      fn({
        dispatchProviderEvent: {
          create: vi.fn(),
          update: vi.fn(),
        },
        dispatch: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        dispatchEvent: { create: vi.fn() },
        order: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }),
    );
    await expect(
      service({
        dispatchProviderEvent: { findUnique: vi.fn().mockResolvedValue(null) },
        dispatch: {
          findFirst: vi.fn().mockResolvedValue(dispatch),
          findUnique: vi.fn().mockResolvedValue(dispatch),
        },
        $transaction: tx,
      }).pepsaOrderEvent(timestamp, signature, body),
    ).resolves.toEqual({ accepted: true });
    expect(tx).toHaveBeenCalled();
  });

  it('quarantines conflicting event id reuse', async () => {
    const body = baseBody();
    const { timestamp, signature } = signed(body);
    await expect(
      service({
        dispatchProviderEvent: {
          findUnique: vi.fn().mockResolvedValue({ payloadHash: 'other' }),
        },
        dispatch: {
          findFirst: vi.fn().mockResolvedValue({
            status: 'PENDING_MATCH',
            providerReference: 'ship-1',
          }),
          findUnique: vi.fn(),
        },
      }).pepsaOrderEvent(timestamp, signature, body),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
