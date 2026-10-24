import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DispatchProviderPort,
  LocalDispatchProviderAdapter,
} from './dispatch-ports.js';

type SubmitInput = Parameters<DispatchProviderPort['submit']>[0];

@Injectable()
export class PepsaOrderDispatchAdapter extends DispatchProviderPort {
  constructor(
    private readonly config: ConfigService,
    private readonly local: LocalDispatchProviderAdapter,
  ) {
    super();
  }

  quote(input: Parameters<DispatchProviderPort['quote']>[0]) {
    return this.local.quote(input);
  }

  async submit(input: SubmitInput) {
    if (input.mode === 'OWN_FLEET') return this.local.submit(input);
    const base = this.required('PEPSA_ORDER_URL');
    if (
      !input.paymentReference ||
      !input.amountMinor ||
      !input.currency ||
      !input.pickup ||
      !input.orders?.length
    )
      throw new ConflictException('General Pool submission is incomplete');
    if (input.orders.length !== 1)
      throw new ConflictException(
        'General Pool batches require the Pepsa Order batch contract',
      );
    const order = input.orders[0];
    const intake = {
      externalReference: input.dispatchReference,
      sender: this.location(input.pickup, order.sender),
      recipient: this.location(order.delivery, order.receiver),
      category: this.code(order.orderType),
      itemDescription: order.itemDescription,
      ...(order.sizeEstimate ? { itemSize: order.sizeEstimate } : {}),
      ...(order.declaredValue != null
        ? {
            declaredValue: {
              amountMinor: String(Math.round(order.declaredValue * 100)),
              currency: input.currency,
            },
          }
        : {}),
      fragile: order.fragile,
      deliveryScope: 'LAST_MILE',
      preferredMobility: this.code(input.mobilityMethod ?? 'motorcycle'),
      timing: order.deliveryStatus,
      ...(order.deliveryStatus === 'SCHEDULED'
        ? {
            scheduledWindow: {
              start: order.scheduledStart,
              end: order.scheduledEnd,
            },
          }
        : {}),
      quote: {
        reference: `vendor:${input.dispatchReference}`,
        amountMinor: String(input.amountMinor),
        currency: input.currency,
        expiresAt:
          input.quoteExpiresAt ??
          new Date(Date.now() + 10 * 60_000).toISOString(),
      },
    };
    let created: Record<string, unknown>;
    try {
      created = await this.request(`${base}/api/v1/orders`, {
        method: 'POST',
        headers: this.headers(`general-pool:${input.dispatchReference}`),
        body: JSON.stringify(intake),
      });
    } catch (error) {
      try {
        created = await this.request(
          `${base}/api/v1/orders/external-reference/${encodeURIComponent(input.dispatchReference)}`,
          {
            method: 'GET',
            headers: this.headers(
              `general-pool-inquiry:${input.dispatchReference}`,
            ),
          },
        );
      } catch {
        throw error;
      }
    }
    const shipmentId = String(created.id ?? '');
    if (!shipmentId)
      throw new ServiceUnavailableException('Pepsa Order response is invalid');
    await this.request(`${base}/api/v1/orders/${shipmentId}/payments/prepaid`, {
      method: 'POST',
      headers: this.headers(`general-pool-prepaid:${input.dispatchReference}`),
      body: JSON.stringify({ authorityReference: input.paymentReference }),
    });
    return { providerReference: shipmentId };
  }

  async cancel(_providerReference: string) {
    // Pepsa Order cancellation is an explicit reasoned compensation. An
    // ambiguous submit is recovered by status inquiry, never blind retry.
  }

  private code(value: string) {
    return value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_');
  }

  private location(
    address: Record<string, unknown>,
    contact: Record<string, unknown>,
  ) {
    const latitude = Number(address.latitude);
    const longitude = Number(address.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
      throw new ConflictException('A geocoded address is required');
    return {
      name: String(contact.name ?? 'Customer'),
      phone: String(contact.phone ?? ''),
      ...(contact.email ? { email: String(contact.email) } : {}),
      locationName: String(
        address.landmark ??
          address.normalizedAddress ??
          address.formattedAddress ??
          address.address ??
          'Address',
      ),
      address: String(
        address.normalizedAddress ??
          address.formattedAddress ??
          address.address ??
          '',
      ),
      latitude,
      longitude,
      city: String(address.city ?? ''),
      state: String(address.state ?? ''),
    };
  }

  private headers(idempotencyKey: string) {
    return {
      'content-type': 'application/json',
      'x-pepsa-api-id': this.required('PEPSA_ORDER_API_ID'),
      'x-pepsa-sub-id': this.required('PEPSA_ORDER_SUB_ID'),
      'x-pepsa-security-token': this.required('PEPSA_ORDER_SECURITY_TOKEN'),
      'x-pepsa-cost-type':
        this.config.get<string>('PEPSA_ORDER_COST_TYPE') ?? 'VENDOR_PREPAID',
      'idempotency-key': idempotencyKey,
    };
  }

  private required(name: string) {
    const value = this.config.get<string>(name)?.replace(/\/$/, '');
    if (!value)
      throw new ServiceUnavailableException(`${name} is not configured`);
    return value;
  }

  private async request(url: string, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Number(this.config.get('PEPSA_ORDER_TIMEOUT_MS') ?? 5000),
    );
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const body = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!response.ok)
        throw new ServiceUnavailableException(
          `Pepsa Order rejected the request (${response.status})`,
        );
      return body;
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof ServiceUnavailableException
      )
        throw error;
      throw new ServiceUnavailableException('Pepsa Order is unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}
