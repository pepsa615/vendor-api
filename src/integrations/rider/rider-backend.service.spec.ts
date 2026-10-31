import { afterEach, describe, expect, it, vi } from 'vitest';
import { RiderBackendService } from './rider-backend.service.js';

const input = {
  vendorId: '11111111-1111-4111-8111-111111111111',
  vendorName: 'Kano Logistics',
  dispatcherId: '22222222-2222-4222-8222-222222222222',
  approvedRevisionId: '33333333-3333-4333-8333-333333333333',
  firstName: 'Ada',
  lastName: 'Okafor',
  phone: '+2348012345678',
  email: 'ada@example.com',
  dateOfBirth: '1994-06-12',
  gender: 'FEMALE',
  homeAddress: '12 Main Street',
  state: 'Lagos',
  city: 'Ikeja',
  vehicleType: 'MOTORCYCLE' as const,
  sourceUpdatedAt: '2026-10-31T00:00:00.000Z',
};

describe('RiderBackendService provisioning contract', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the isolated provisioning credential and preserves correlation/idempotency', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          riderId: '44444444-4444-4444-8444-444444444444',
          externalDispatcherId: input.dispatcherId,
          status: 'PENDING_ACTIVATION',
          created: true,
          activationDeliveryStatus: 'SENT',
          createdAt: '2026-10-31T00:00:01.000Z',
          updatedAt: '2026-10-31T00:00:01.000Z',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const values: Record<string, string | number> = {
      RIDER_FLEET_BASE_URL: 'https://rider.example',
      RIDER_PROVISIONING_API_TOKEN: 'provisioning-secret',
      FLEET_API_TOKEN: 'read-only-secret',
      RIDER_FLEET_TIMEOUT_MS: 5000,
    };
    const service = new RiderBackendService({
      get: (key: string) => values[key],
    } as never);

    const result = await service.provision(
      input,
      'dispatcher-rider:key',
      'request-1',
    );

    expect(result.status).toBe('PENDING_ACTIVATION');
    const [url, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      `https://rider.example/v1/internal/riders/by-dispatcher/${input.dispatcherId}`,
    );
    expect(request.headers).toMatchObject({
      authorization: 'Bearer provisioning-secret',
      'idempotency-key': 'dispatcher-rider:key',
      'x-request-id': 'request-1',
    });
    expect(request.body).toBe(JSON.stringify(input));
  });

  it('classifies identity conflicts as non-retryable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'RIDER_IDENTITY_CONFLICT' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const service = new RiderBackendService({
      get: (key: string) =>
        ({
          RIDER_FLEET_BASE_URL: 'https://rider.example',
          RIDER_PROVISIONING_API_TOKEN: 'provisioning-secret',
          RIDER_FLEET_TIMEOUT_MS: 5000,
        })[key],
    } as never);

    await expect(
      service.provision(input, 'key', 'request-1'),
    ).rejects.toMatchObject({
      message: 'RIDER_IDENTITY_CONFLICT',
      retryable: false,
      status: 409,
    });
  });
});
