import { describe, expect, it, vi } from 'vitest';
import { DispatchService } from './dispatch.service.js';

describe('publishToOpenDispatch', () => {
  it('submits GENERAL_POOL without riderExternalId and clears OWN_FLEET dispatcher', async () => {
    const submit = vi.fn().mockResolvedValue({
      providerReference: 'shipment-open-1',
    });
    const reserve = vi.fn().mockResolvedValue({
      deferred: false,
      paymentReference: 'pay-open-1',
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const dispatchRow = {
      id: 'dispatch-1',
      tenantId: 'tenant-1',
      publicReference: 'D-OPEN1',
      mode: 'OWN_FLEET',
      status: 'PENDING_MATCH',
      optimizedDistanceMetres: 1200,
      optimizedDurationSeconds: 600,
      routeSnapshot: {
        pickup: { address: 'a', latitude: 1, longitude: 2 },
        stops: [],
      },
      items: [
        {
          order: {
            id: 'order-1',
            sender: {},
            receiver: {},
            delivery: {},
            orderType: 'parcel',
            itemDescription: 'box',
            sizeEstimate: null,
            fragile: false,
            parcelMetadata: null,
            deliveryStatus: 'ASAP',
            scheduledStart: null,
            scheduledEnd: null,
          },
        },
      ],
    };
    const response = {
      ...dispatchRow,
      mode: 'GENERAL_POOL',
      dispatcherId: null,
      providerReference: 'shipment-open-1',
    };
    const sut = new DispatchService(
      {
        idempotencyRecord: { findUnique: vi.fn().mockResolvedValue(null) },
        dispatch: {
          findFirst: vi.fn().mockResolvedValue(dispatchRow),
        },
        $transaction: vi.fn(async (fn: (client: object) => Promise<unknown>) =>
          fn({
            dispatch: {
              updateMany,
              findUniqueOrThrow: vi.fn().mockResolvedValue(response),
            },
            dispatchEvent: { create: vi.fn() },
            idempotencyRecord: { create: vi.fn() },
          }),
        ),
      } as never,
      {} as never,
      { submit, cancel: vi.fn() } as never,
      { reserve } as never,
      { get: () => undefined } as never,
      { record: vi.fn() } as never,
      {} as never,
      { resolveOptional: vi.fn().mockResolvedValue(null) } as never,
      {} as never,
    );
    (sut as any).generalPoolQuote = vi.fn().mockResolvedValue({
      amountMinor: 55_000,
      currency: 'NGN',
    });
    (sut as any).detail = vi.fn().mockResolvedValue(dispatchRow);
    (sut as any).detailInclude = vi.fn().mockReturnValue({});

    const result = await sut.publishToOpenDispatch(
      'tenant-1',
      'actor-1',
      'dispatch-1',
      'idem-1',
      'motorcycle',
    );

    expect(result).toEqual(response);
    expect(reserve).toHaveBeenCalledWith(
      expect.objectContaining({ chargeCode: 'GENERAL_POOL_DISPATCH' }),
    );
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'GENERAL_POOL',
        mobilityMethod: 'motorcycle',
      }),
    );
    expect(submit.mock.calls[0]![0].riderExternalId).toBeUndefined();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mode: 'GENERAL_POOL',
          dispatcherId: null,
        }),
      }),
    );
  });
});
