import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { VendorAdminService } from './vendor-admin.service.js';

function service(db: object, audit: object = { record: vi.fn() }) {
  return new VendorAdminService(
    db as never,
    audit as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('VendorAdminService contract safety', () => {
  it('rejects malformed pagination and status filters', async () => {
    await expect(
      service({}).vendors(new URLSearchParams({ pageSize: 'NaN' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service({}).vendors(new URLSearchParams({ status: 'UNKNOWN' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('applies vendor resource scope to directory reads', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await service({ vendor: { findMany } }).vendors(new URLSearchParams(), [
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['11111111-1111-4111-8111-111111111111'] },
        }),
      }),
    );
  });

  it('revokes every active session and records destination audit', async () => {
    const audit = { record: vi.fn() };
    const updateMany = vi.fn().mockResolvedValue({ count: 3 });
    const result = await service(
      {
        vendor: { findUnique: vi.fn().mockResolvedValue({ id: 'vendor-1' }) },
        session: { updateMany },
      },
      audit,
    ).revokeSessions('vendor-1', 'admin-1', 'security response');
    expect(result.revokedSessions).toBe(3);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user: { tenantId: 'vendor-1' }, revokedAt: null },
      }),
    );
    expect(audit.record).toHaveBeenCalledOnce();
  });

  it('exercises every Phase 6 operational alert and links a runbook', async () => {
    const count = vi.fn().mockResolvedValue(1);
    const result = await service({
      vendorProvisioningSaga: { count },
      reconciliationCase: { count },
      feeReceivable: { count },
      dispatch: { count },
      paymentWebhookEvent: { count },
      emailOutbox: { count },
    }).operationalHealth();
    expect(result.alerts).toHaveLength(7);
    expect(result.alerts.every((alert) => alert.status === 'ALERTING')).toBe(
      true,
    );
    expect(
      result.alerts.every((alert) =>
        String(alert.runbook).startsWith('docs/runbooks/'),
      ),
    ).toBe(true);
  });

  it('separates unpriced orders from projected GMV and exposes a watermark', async () => {
    const now = new Date();
    const result = await service({
      order: {
        findMany: vi.fn().mockResolvedValue([
          {
            tenantId: 'vendor-1',
            amountMinor: 10_000,
            createdAt: now,
            updatedAt: now,
          },
          {
            tenantId: 'vendor-1',
            amountMinor: null,
            createdAt: now,
            updatedAt: now,
          },
        ]),
      },
      dispatch: { findMany: vi.fn().mockResolvedValue([]) },
      vendorSettlementEntry: { findMany: vi.fn().mockResolvedValue([]) },
      vendor: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'vendor-1', businessName: 'Vendor' }]),
      },
    }).performance(1);
    expect(result.series[0]).toMatchObject({
      orderCount: 2,
      unpricedOrderCount: 1,
      gmvMinor: 10_000,
    });
    expect(result.watermark).toBe(now.toISOString());
  });
});
