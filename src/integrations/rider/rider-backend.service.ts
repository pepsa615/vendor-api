import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type RiderLookupResult = {
  riderId: string;
  phone: string;
  photo: string | null;
  activity: string;
  online: boolean;
  position: { latitude: number; longitude: number } | null;
  locationObservedAt: string | null;
};

export type ProvisionRiderInput = {
  vendorId: string;
  vendorName: string;
  dispatcherId: string;
  approvedRevisionId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  homeAddress: string;
  state: string;
  city: string;
  vehicleType:
    | 'MOTORCYCLE'
    | 'MOTORCYCLE_CART'
    | 'TRICYCLE'
    | 'CAR'
    | 'VAN'
    | 'TRUCK'
    | 'LONG_TRUCK';
  sourceUpdatedAt: string;
};

export type ProvisionRiderResult = {
  riderId: string;
  externalDispatcherId: string;
  status: string;
  created: boolean;
  activationDeliveryStatus: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type RiderProvisioningState = {
  riderId: string;
  externalDispatcherId: string;
  provisioningStatus: string;
  onboardingStatus: string;
  activity: string;
  updatedAt: string | null;
};

@Injectable()
export class RiderBackendService {
  private readonly logger = new Logger(RiderBackendService.name);

  constructor(private readonly config: ConfigService) {}

  async provisioningState(
    dispatcherId: string,
  ): Promise<RiderProvisioningState> {
    const base = this.config.get<string>('RIDER_FLEET_BASE_URL');
    const token = this.config.get<string>('RIDER_PROVISIONING_API_TOKEN');
    if (!base || !token) throw new Error('RIDER_PROVISIONING_NOT_CONFIGURED');
    const response = await fetch(
      new URL(
        `/v1/internal/riders/by-dispatcher/${encodeURIComponent(dispatcherId)}`,
        base.replace(/\/$/, ''),
      ),
      {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(
          Number(this.config.get('RIDER_FLEET_TIMEOUT_MS') ?? 5000),
        ),
      },
    );
    if (!response.ok) throw new Error(`RIDER_STATUS_${response.status}`);
    return (await response.json()) as RiderProvisioningState;
  }

  async provision(
    input: ProvisionRiderInput,
    idempotencyKey: string,
    requestId: string,
  ): Promise<ProvisionRiderResult> {
    const base = this.config.get<string>('RIDER_FLEET_BASE_URL');
    const token = this.config.get<string>('RIDER_PROVISIONING_API_TOKEN');
    if (!base || !token) throw new Error('RIDER_PROVISIONING_NOT_CONFIGURED');
    const url = new URL(
      `/v1/internal/riders/by-dispatcher/${encodeURIComponent(input.dispatcherId)}`,
      base.replace(/\/$/, ''),
    );
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'idempotency-key': idempotencyKey,
        'x-request-id': requestId,
      },
      body: JSON.stringify(input),
      redirect: 'error',
      signal: AbortSignal.timeout(
        Number(this.config.get('RIDER_FLEET_TIMEOUT_MS') ?? 5000),
      ),
    });
    const body = (await response.json().catch(() => null)) as
      ProvisionRiderResult | { code?: string; message?: string } | null;
    if (!response.ok) {
      const code = body && 'code' in body ? body.code : undefined;
      const error = new Error(code ?? `RIDER_PROVISIONING_${response.status}`);
      Object.assign(error, {
        status: response.status,
        retryable: response.status >= 500 || response.status === 429,
      });
      throw error;
    }
    return body as ProvisionRiderResult;
  }

  async lookupByPhone(phone: string): Promise<RiderLookupResult | null> {
    const base = this.config.get<string>('RIDER_FLEET_BASE_URL');
    const token = this.config.get<string>('FLEET_API_TOKEN');
    if (!base || !token) {
      this.logger.debug('Rider fleet lookup skipped — not configured');
      return null;
    }
    const trimmed = phone.trim();
    if (!trimmed) return null;

    try {
      const url = new URL(
        '/v1/internal/riders/by-phone',
        base.replace(/\/$/, ''),
      );
      url.searchParams.set('phone', trimmed);
      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(
          Number(this.config.get('RIDER_FLEET_TIMEOUT_MS') ?? 5000),
        ),
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        this.logger.warn(`Rider lookup failed (${response.status})`);
        return null;
      }
      return (await response.json()) as RiderLookupResult;
    } catch (error) {
      this.logger.warn(
        `Rider lookup unavailable: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }
}
