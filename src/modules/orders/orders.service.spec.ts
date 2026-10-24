import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OrdersService } from './orders.service.js';

describe('OrdersService state policy', () => {
  const order = {
    id: 'order-1',
    tenantId: 'tenant-1',
    source: 'CUSTOMER_LINK',
    status: 'PENDING_ACCEPTANCE',
    paymentStatus: 'PAID',
  };
  it('accepts only a paid customer-link order awaiting acceptance', async () => {
    const db = {
      idempotencyRecord: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      order: {
        findFirst: vi.fn().mockResolvedValue(order),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new OrdersService(
      db as never,
      {} as never,
      {} as never,
      {
        record: vi.fn(),
      } as never,
      {} as never,
      {} as never,
    );
    vi.spyOn(service, 'detail').mockResolvedValue(order as never);
    await expect(
      service.transition('tenant-1', 'actor-1', 'order-1', 'accept', 'key-1'),
    ).resolves.toEqual(order);
  });
  it('rejects acceptance before verified payment', async () => {
    const db = {
      idempotencyRecord: { findUnique: vi.fn().mockResolvedValue(null) },
      order: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ ...order, paymentStatus: 'PENDING' }),
      },
    };
    const service = new OrdersService(
      db as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.transition('tenant-1', 'actor-1', 'order-1', 'accept', 'key-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
