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

/** Vendor orderType → pepsa-order ItemCategory.code */
const CATEGORY_CODES: Record<string, string> = {
  food_essentials: 'FOOD_ESSENTIALS',
  pharmaceutical: 'PHARMACEUTICAL_ITEMS',
  mail_parcel: 'MAIL_SMALL_PARCEL',
  laundry_clothing: 'LAUNDRY_CLOTHES',
  electronics_gadgets: 'ELECTRONICS_GADGETS',
  large_item: 'LARGE_ITEMS_OTHER',
};

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
    const base = this.required('PEPSA_ORDER_URL');
    if (
      !input.paymentReference ||
      !input.amountMinor ||
      !input.currency ||
      !input.pickup ||
      !input.orders?.length
    )
      throw new ConflictException(
        input.mode === 'OWN_FLEET'
          ? 'Own-fleet submission is incomplete'
          : 'General Pool submission is incomplete',
      );
    if (input.mode === 'OWN_FLEET') {
      if (!input.riderExternalId)
        throw new ConflictException(
          'Own-fleet dispatcher must be linked to an active RiderApp account',
        );
      if (input.orders.length > 1)
        throw new ConflictException(
          'Own-fleet pepsa-order intake currently supports a single order; batch runway is not enabled yet',
        );
    }
    if (input.mode === 'GENERAL_POOL' && input.orders.length > 1)
      return this.submitBatch(base, input);
    return this.submitSingle(base, input);
  }

  private async submitSingle(base: string, input: SubmitInput) {
    const order = input.orders![0];
    const ownFleet = input.mode === 'OWN_FLEET';
    const keyPrefix = ownFleet ? 'own-fleet' : 'general-pool';
    const timing = this.timing(order.deliveryStatus);
    const intake = {
      externalReference: input.dispatchReference,
      sender: this.location(input.pickup!, order.sender),
      recipient: this.location(order.delivery, order.receiver),
      category: this.category(order.orderType),
      itemDescription: order.itemDescription,
      ...(order.sizeEstimate ? { itemSize: order.sizeEstimate } : {}),
      ...(order.declaredValue != null &&
      Number.isFinite(Number(order.declaredValue))
        ? {
            declaredValue: {
              amountMinor: String(Math.round(Number(order.declaredValue) * 100)),
              currency: input.currency,
            },
          }
        : {}),
      fragile: order.fragile,
      deliveryScope: 'LAST_MILE',
      preferredMobility: this.code(input.mobilityMethod || 'motorcycle'),
      timing,
      ...(timing === 'SCHEDULED'
        ? {
            scheduledWindow: {
              start: order.scheduledStart,
              end: order.scheduledEnd,
            },
          }
        : {}),
      ...(ownFleet && input.riderExternalId
        ? { assignedRiderExternalId: input.riderExternalId }
        : {}),
      ...(ownFleet &&
      input.payoutAmountMinor != null &&
      Number(input.payoutAmountMinor) > 0
        ? { riderPayoutMinor: String(Math.round(Number(input.payoutAmountMinor))) }
        : {}),
      quote: {
        reference: `vendor:${input.dispatchReference}`,
        amountMinor: String(Math.max(1, Number(input.amountMinor) || 0)),
        currency: input.currency,
        expiresAt:
          input.quoteExpiresAt ||
          new Date(Date.now() + 10 * 60_000).toISOString(),
      },
    };
    let created: Record<string, unknown>;
    try {
      created = await this.request(`${base}/api/v1/orders`, {
        method: 'POST',
        headers: this.headers(`${keyPrefix}:${input.dispatchReference}`),
        body: JSON.stringify(intake),
      });
    } catch (error) {
      try {
        created = await this.request(
          `${base}/api/v1/orders/external-reference/${encodeURIComponent(input.dispatchReference)}`,
          {
            method: 'GET',
            headers: this.headers(
              `${keyPrefix}-inquiry:${input.dispatchReference}`,
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
    try {
      await this.request(
        `${base}/api/v1/orders/${shipmentId}/payments/prepaid`,
        {
          method: 'POST',
          headers: this.headers(
            `${keyPrefix}-prepaid:${input.dispatchReference}`,
          ),
          body: JSON.stringify({ authorityReference: input.paymentReference }),
        },
      );
    } catch (error) {
      if (ownFleet) {
        throw new ConflictException(
          error instanceof Error
            ? error.message
            : 'Assigned rider could not be pinned in Pepsa Order. Ensure the rider is online in RiderApp.',
        );
      }
      throw error;
    }
    return { providerReference: shipmentId };
  }

  private async submitBatch(base: string, input: SubmitInput) {
    if (this.config.get<string>('PEPSA_ORDER_BATCH_INTAKE_ENABLED') !== 'true')
      throw new ConflictException('Pepsa Order batch intake is unavailable');
    const shipments = input.orders!.map((order) => {
      const timing = this.timing(order.deliveryStatus);
      return {
        sender: this.location(input.pickup!, order.sender),
        recipient: this.location(order.delivery, order.receiver),
        category: this.category(order.orderType),
        itemDescription: order.itemDescription,
        ...(order.sizeEstimate ? { itemSize: order.sizeEstimate } : {}),
        ...(order.declaredValue != null &&
        Number.isFinite(Number(order.declaredValue))
          ? {
              declaredValue: {
                amountMinor: String(
                  Math.round(Number(order.declaredValue) * 100),
                ),
                currency: input.currency,
              },
            }
          : {}),
        fragile: order.fragile,
        deliveryScope: 'LAST_MILE',
        preferredMobility: this.code(input.mobilityMethod || 'motorcycle'),
        timing,
        ...(timing === 'SCHEDULED'
          ? {
              scheduledWindow: {
                start: order.scheduledStart,
                end: order.scheduledEnd,
              },
            }
          : {}),
      };
    });
    const body = {
      externalReference: input.dispatchReference,
      authorityReference: input.paymentReference,
      quote: {
        reference: `vendor:${input.dispatchReference}`,
        amountMinor: String(input.amountMinor),
        currency: input.currency,
        expiresAt: input.quoteExpiresAt,
      },
      shipments,
    };
    let result: Record<string, unknown>;
    try {
      result = await this.request(`${base}/api/v1/orders/batches/prepaid`, {
        method: 'POST',
        headers: this.headers(`general-pool-batch:${input.dispatchReference}`),
        body: JSON.stringify(body),
      });
    } catch (error) {
      try {
        result = await this.request(
          `${base}/api/v1/orders/batches/external-reference/${encodeURIComponent(input.dispatchReference)}`,
          {
            method: 'GET',
            headers: this.headers(
              `general-pool-batch-inquiry:${input.dispatchReference}`,
            ),
          },
        );
      } catch {
        throw error;
      }
    }
    if (!result.externalReference)
      throw new ServiceUnavailableException(
        'Pepsa Order batch response is invalid',
      );
    return { providerReference: String(result.externalReference) };
  }

  async cancel(_providerReference: string) {
    // Pepsa Order cancellation is an explicit reasoned compensation. An
    // ambiguous submit is recovered by status inquiry, never blind retry.
  }

  async resolveAssignedRider(providerReference: string) {
    const base = this.required('PEPSA_ORDER_URL');
    try {
      const row = await this.request(`${base}/api/v1/orders/${providerReference}`, {
        method: 'GET',
        headers: this.headers(`assigned-rider:${providerReference}`),
      });
      const rider =
        typeof row.assignedRiderExternalId === 'string'
          ? row.assignedRiderExternalId.trim()
          : '';
      return rider || null;
    } catch {
      return null;
    }
  }

  private code(value: string) {
    return value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_');
  }

  private category(orderType: string) {
    const key = orderType.trim().toLowerCase();
    return CATEGORY_CODES[key] ?? this.code(orderType);
  }

  /** Pepsa Order only accepts INSTANT|SCHEDULED — never fulfilment statuses. */
  private timing(deliveryStatus: string | null | undefined) {
    return deliveryStatus === 'SCHEDULED' ? 'SCHEDULED' : 'INSTANT';
  }

  private location(
    address: Record<string, unknown>,
    contact: Record<string, unknown>,
  ) {
    const latitude = Number(address.latitude);
    const longitude = Number(address.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
      throw new ConflictException('A geocoded address is required');
    const fullAddress = String(
      address.normalizedAddress ??
        address.formattedAddress ??
        address.address ??
        '',
    ).trim();
    const city = String(
      address.city ?? address.normalizedCity ?? '',
    ).trim();
    const state = String(
      address.state ?? address.normalizedState ?? '',
    ).trim();
    if (!fullAddress || !city || !state)
      throw new ConflictException(
        'Pickup/delivery must include address, city, and state before dispatch',
      );
    return {
      name: String(contact.name ?? 'Customer'),
      phone: String(contact.phone ?? ''),
      ...(contact.email ? { email: String(contact.email) } : {}),
      locationName: String(
        address.landmark ?? fullAddress,
      ),
      address: fullAddress,
      latitude,
      longitude,
      city,
      state,
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
      if (!response.ok) {
        const detail =
          typeof body.message === 'string'
            ? body.message
            : Array.isArray(body.message)
              ? body.message.join('; ')
              : `Pepsa Order rejected the request (${response.status})`;
        if (response.status === 409 || response.status === 422)
          throw new ConflictException(detail);
        throw new ServiceUnavailableException(detail);
      }
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
