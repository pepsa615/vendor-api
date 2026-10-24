import { describe, expect, it, vi } from 'vitest';
import { ReportingService } from './reporting.service.js';

describe('ReportingService', () => {
  it('calculates period-over-period dashboard growth from tenant-owned records', async () => {
    const dispatchFindMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          status: 'COMPLETED',
          dispatcherId: null,
          payoutAmountMinor: 200,
          optimizedDistanceMetres: 2000,
          createdAt: new Date('2026-02-10'),
          items: [{ order: { amountMinor: 1000, source: 'STAFF' } }],
        },
        {
          status: 'COMPLETED',
          dispatcherId: null,
          payoutAmountMinor: 200,
          optimizedDistanceMetres: 2000,
          createdAt: new Date('2026-02-15'),
          items: [{ order: { amountMinor: 1000, source: 'STAFF' } }],
        },
      ])
      .mockResolvedValueOnce([
        {
          status: 'COMPLETED',
          payoutAmountMinor: 200,
          optimizedDistanceMetres: 2000,
          items: [{ order: { amountMinor: 1000 } }],
        },
      ]);
    const db = {
      dispatch: {
        findMany: dispatchFindMany,
        groupBy: vi.fn().mockResolvedValue([]),
      },
      vendorSettlementEntry: {
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({ _sum: { earningsMinor: 500 } })
          .mockResolvedValueOnce({ _sum: { earningsMinor: 250 } }),
      },
      order: {
        groupBy: vi
          .fn()
          .mockResolvedValueOnce([
            {
              source: 'STAFF',
              status: 'ACCEPTED',
              _count: { _all: 2 },
              _sum: { amountMinor: 2000 },
            },
          ])
          .mockResolvedValueOnce([
            {
              source: 'STAFF',
              status: 'ACCEPTED',
              _count: { _all: 1 },
              _sum: { amountMinor: 1000 },
            },
          ]),
      },
      customer: { count: vi.fn().mockResolvedValue(0) },
      manifest: { count: vi.fn().mockResolvedValue(0) },
      dispatcher: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const result = await new ReportingService(db as never).dashboard(
      'tenant-a',
      {
        from: '2026-02-01',
        to: '2026-03-01',
        page: 1,
        pageSize: 20,
      },
    );
    expect(result.overview.dispatch.growth.all).toBe(100);
    expect(result.overview.revenue.growth.earningsMinor).toBe(100);
    expect(result.overview.order.growth.all).toBe(100);
    expect(
      dispatchFindMany.mock.calls.every(
        ([query]) => query.where.tenantId === 'tenant-a',
      ),
    ).toBe(true);
  });

  it('rejects inverted and overlong reporting ranges', () => {
    const service = new ReportingService({} as never);
    expect(() =>
      service.range({
        from: '2026-02-01',
        to: '2026-01-01',
        page: 1,
        pageSize: 20,
      }),
    ).toThrow();
    expect(() =>
      service.range({
        from: '2024-01-01',
        to: '2026-01-01',
        page: 1,
        pageSize: 20,
      }),
    ).toThrow();
  });

  it('escapes formula cells in CSV exports', async () => {
    const db = {
      $transaction: vi.fn(async (queries: Promise<unknown>[]) =>
        Promise.all(queries),
      ),
      vendorSettlementEntry: {
        findMany: vi.fn().mockResolvedValue([
          {
            sourceReference: '=HYPERLINK("bad")',
            source: 'CUSTOMER_LINK',
            counterpartyName: '+name',
            status: 'COMPLETED',
            totalAmountMinor: 100,
            earningsMinor: 100,
            currency: 'NGN',
            createdAt: new Date('2026-01-01'),
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    const service = new ReportingService(db as never);
    const csv = await service.settlementsCsv('tenant', {
      from: '2025-12-01',
      to: '2026-02-01',
      page: 1,
      pageSize: 20,
    });
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+name");
  });
});
