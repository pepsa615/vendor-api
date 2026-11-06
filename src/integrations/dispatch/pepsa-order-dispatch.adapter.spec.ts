import { ConflictException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PepsaOrderDispatchAdapter } from './pepsa-order-dispatch.adapter.js';
import { LocalDispatchProviderAdapter } from './dispatch-ports.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const geo = {
  address: '12 Test St',
  city: 'Lagos',
  state: 'LA',
  latitude: 6.45,
  longitude: 3.39,
};
const order = {
  id: 'order-1',
  sender: { name: 'A', phone: '08011111111', ...geo },
  receiver: { name: 'B', phone: '08022222222', ...geo },
  delivery: { ...geo },
  orderType: 'parcel',
  itemDescription: 'box',
  fragile: false,
  deliveryStatus: 'ASAP',
};

function adapter(fetchImpl: typeof fetch) {
  vi.stubGlobal('fetch', fetchImpl);
  return new PepsaOrderDispatchAdapter(
    {
      get: (key: string) =>
        ({
          PEPSA_ORDER_URL: 'http://order.test',
          PEPSA_ORDER_API_ID: 'api',
          PEPSA_ORDER_SUB_ID: 'sub',
          PEPSA_ORDER_SECURITY_TOKEN: 'token-at-least-16',
          PEPSA_ORDER_COST_TYPE: 'VENDOR_PREPAID',
          PEPSA_ORDER_TIMEOUT_MS: '5000',
          PEPSA_ORDER_BATCH_INTAKE_ENABLED: 'false',
        })[key],
    } as never,
    new LocalDispatchProviderAdapter(),
  );
}

describe('PepsaOrderDispatchAdapter OWN_FLEET', () => {
  it('submits assignedRiderExternalId and own-fleet idempotency prefix', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const sut = adapter(async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/api/v1/orders')) {
        return new Response(
          JSON.stringify({ id: 'shipment-1', state: 'AWAITING_PAYMENT' }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const result = await sut.submit({
      dispatchReference: 'D-OWN1',
      mode: 'OWN_FLEET',
      dispatcherId: 'dispatcher-vendor-id',
      riderExternalId: '146eabab-1111-4111-8111-111111111111',
      stops: [],
      paymentReference: 'pay-1',
      amountMinor: 25000,
      riderPayoutMinor: 51896,
      currency: 'NGN',
      pickup: { ...geo },
      orders: [order],
    });

    expect(result).toEqual({ providerReference: 'shipment-1' });
    const create = calls.find((c) => c.url.endsWith('/api/v1/orders'));
    expect(create?.init?.headers).toMatchObject({
      'idempotency-key': 'own-fleet:D-OWN1',
    });
    const body = JSON.parse(String(create?.init?.body));
    expect(body.assignedRiderExternalId).toBe(
      '146eabab-1111-4111-8111-111111111111',
    );
    expect(body.riderPayoutMinor).toBe('51896');
    expect(body.quote.amountMinor).toBe('25000');
    const prepaid = calls.find((c) => String(c.url).includes('/prepaid'));
    expect(prepaid?.init?.headers).toMatchObject({
      'idempotency-key': 'own-fleet-prepaid:D-OWN1',
    });
  });

  it('keeps GENERAL_POOL without assignedRiderExternalId', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const sut = adapter(async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/api/v1/orders')) {
        return new Response(
          JSON.stringify({ id: 'shipment-pool', state: 'AWAITING_PAYMENT' }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    await sut.submit({
      dispatchReference: 'D-POOL1',
      mode: 'GENERAL_POOL',
      mobilityMethod: 'motorcycle',
      stops: [],
      paymentReference: 'pay-2',
      amountMinor: 40000,
      currency: 'NGN',
      pickup: { ...geo },
      orders: [order],
    });

    const create = calls.find((c) => c.url.endsWith('/api/v1/orders'));
    expect(create?.init?.headers).toMatchObject({
      'idempotency-key': 'general-pool:D-POOL1',
    });
    const body = JSON.parse(String(create?.init?.body));
    expect(body.assignedRiderExternalId).toBeUndefined();
  });

  it('rejects OWN_FLEET without riderExternalId', async () => {
    const sut = adapter(async () => new Response('{}', { status: 500 }));
    await expect(
      sut.submit({
        dispatchReference: 'D-OWN2',
        mode: 'OWN_FLEET',
        dispatcherId: 'dispatcher-vendor-id',
        stops: [],
        paymentReference: 'pay-1',
        amountMinor: 25000,
        currency: 'NGN',
        pickup: { ...geo },
        orders: [order],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
