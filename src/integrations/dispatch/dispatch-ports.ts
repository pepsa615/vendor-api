import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import { PaymentService } from '../payment/payment.service.js';

export type OptimizedStop = {
  orderId: string;
  sequence: number;
  latitude?: number;
  longitude?: number;
  address: string;
};

export abstract class RouteOptimizationPort {
  abstract optimize(input: {
    pickup: { address: string; latitude?: number; longitude?: number };
    deliveries: Array<{
      orderId: string;
      address: string;
      latitude?: number;
      longitude?: number;
    }>;
  }): Promise<{
    stops: OptimizedStop[];
    distanceMetres: number;
    durationSeconds: number;
  }>;
}

export abstract class DispatchProviderPort {
  abstract quote(input: {
    mobilityMethod: string;
    distanceMetres: number;
    durationSeconds: number;
    pickupState: string;
  }): Promise<{ amountMinor: number; currency: string }>;
  abstract submit(input: {
    dispatchReference: string;
    mode: 'OWN_FLEET' | 'GENERAL_POOL';
    mobilityMethod?: string;
    dispatcherId?: string;
    stops: OptimizedStop[];
    paymentReference?: string;
    amountMinor?: number;
    currency?: string;
    quoteExpiresAt?: string;
    pickup?: Record<string, unknown>;
    orders?: Array<{
      id: string;
      sender: Record<string, unknown>;
      receiver: Record<string, unknown>;
      delivery: Record<string, unknown>;
      orderType: string;
      itemDescription: string;
      sizeEstimate?: string | null;
      fragile: boolean;
      declaredValue?: number;
      deliveryStatus: string;
      scheduledStart?: string | null;
      scheduledEnd?: string | null;
    }>;
  }): Promise<{ providerReference: string }>;
  abstract cancel(providerReference: string): Promise<void>;
}

export abstract class DispatchFinancePort {
  abstract reserve(input: {
    tenantId: string;
    dispatchReference: string;
    amountMinor: number;
    allowDeferred: boolean;
    chargeCode: 'RUNWAY_DISPATCH' | 'GENERAL_POOL_DISPATCH';
  }): Promise<{ deferred: boolean; paymentReference?: string }>;
}

const estimateRoadMetres = (
  origin: { latitude?: number; longitude?: number },
  destination: { latitude?: number; longitude?: number },
) => {
  if (
    !Number.isFinite(origin.latitude) ||
    !Number.isFinite(origin.longitude) ||
    !Number.isFinite(destination.latitude) ||
    !Number.isFinite(destination.longitude)
  )
    return 0;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMetres = 6_371_000;
  const latitudeDelta = radians(destination.latitude! - origin.latitude!);
  const longitudeDelta = radians(destination.longitude! - origin.longitude!);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(origin.latitude!)) *
      Math.cos(radians(destination.latitude!)) *
      Math.sin(longitudeDelta / 2) ** 2;
  const directMetres =
    earthRadiusMetres * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(500, Math.round(directMetres * 1.25));
};

@Injectable()
export class LocalRouteOptimizationAdapter extends RouteOptimizationPort {
  async optimize(input: Parameters<RouteOptimizationPort['optimize']>[0]) {
    const stops = input.deliveries.map((stop, index) => ({
      ...stop,
      sequence: index + 1,
    }));
    let distanceMetres = stops.reduce(
      (sum, stop) => sum + (estimateRoadMetres(input.pickup, stop) || 5_000),
      0,
    );
    if (!distanceMetres) distanceMetres = Math.max(1, stops.length) * 5_000;
    return {
      stops,
      distanceMetres,
      durationSeconds: Math.max(
        300,
        Math.round(distanceMetres / (25_000 / 3_600)),
      ),
    };
  }
}

@Injectable()
export class LocalDispatchProviderAdapter extends DispatchProviderPort {
  async quote(input: Parameters<DispatchProviderPort['quote']>[0]) {
    const rates: Record<string, number> = {
      bicycle: 8_000,
      motorcycle: 12_000,
      tricycle: 18_000,
      car: 22_000,
      van: 30_000,
      truck: 45_000,
      large_truck: 65_000,
    };
    const ratePerKmMinor = rates[input.mobilityMethod] ?? rates.motorcycle;
    return {
      amountMinor: Math.max(
        100_000,
        Math.round((input.distanceMetres / 1000) * ratePerKmMinor),
      ),
      currency: 'NGN',
    };
  }
  async submit(input: Parameters<DispatchProviderPort['submit']>[0]) {
    return { providerReference: `local:${input.dispatchReference}` };
  }
  async cancel() {}
}

@Injectable()
export class LocalDispatchFinanceAdapter extends DispatchFinancePort {
  constructor(
    private readonly db: PrismaService,
    private readonly payment: PaymentService,
  ) {
    super();
  }
  async reserve(input: Parameters<DispatchFinancePort['reserve']>[0]) {
    if (input.amountMinor < 0)
      throw new ServiceUnavailableException('Invalid funding requirement');
    if (input.amountMinor === 0) return { deferred: false };
    const vendor = await this.db.vendor.findUnique({
      where: { id: input.tenantId },
    });
    if (!vendor?.externalCheckoutUserId) {
      throw new ServiceUnavailableException('Wallet funding is unavailable');
    }
    try {
      const result = await this.payment.commerceDebit(
        {
          external_user_id: input.tenantId,
          amount: (input.amountMinor / 100).toFixed(2),
          currency: 'NGN',
          narration: `Dispatch funding ${input.dispatchReference}`,
          reference: input.dispatchReference,
          charge_code: input.chargeCode,
        },
        `dispatch-funding:${input.dispatchReference}`,
      );
      return { deferred: false, paymentReference: result.transaction_id };
    } catch (error) {
      if (
        input.allowDeferred &&
        error instanceof HttpException &&
        error.getStatus() === 402
      )
        return { deferred: true };
      throw error;
    }
  }
}
