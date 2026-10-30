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

@Injectable()
export class RiderBackendService {
  private readonly logger = new Logger(RiderBackendService.name);

  constructor(private readonly config: ConfigService) {}

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
      const url = new URL('/v1/internal/riders/by-phone', base.replace(/\/$/, ''));
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
