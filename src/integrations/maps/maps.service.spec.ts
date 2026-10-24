import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MapsService } from './maps.service.js';

const config = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as never;

describe('MapsService provider selection', () => {
  it('provides deterministic local routing outside production when no key is configured', async () => {
    const maps = new MapsService(config({ NODE_ENV: 'development' }));
    const address = {
      address: '1 Allen Avenue',
      city: 'Ikeja',
      state: 'Lagos',
      country: 'NG' as const,
    };
    const origin = await maps.geocode(address);
    const repeated = await maps.geocode(address);
    const destination = await maps.geocode({
      ...address,
      address: '10 Obafemi Awolowo Way',
    });
    expect(repeated).toEqual(origin);
    expect(origin.placeId).toMatch(/^local:/);
    expect(await maps.distance(origin, destination)).toEqual(
      expect.objectContaining({
        distanceMetres: expect.any(Number),
        durationSeconds: expect.any(Number),
      }),
    );
  });

  it('resolves addresses from place id without re-geocoding the composed string', async () => {
    const maps = new MapsService(config({ NODE_ENV: 'development' }));
    const suggestions = await maps.placeAutocomplete('Allen Avenue Ikeja');
    const placeId = suggestions[0]!.placeId;
    const resolved = await maps.resolveAddress({
      address: 'Unit 2, Allen Avenue Ikeja, Nigeria',
      city: 'Ikeja',
      state: 'Lagos',
      country: 'NG',
      placeId,
    });
    expect(resolved.placeId).toBe(placeId);
    expect(resolved.latitude).toBeTypeOf('number');
    expect(resolved.landmark).toBeUndefined();
  });

  it('retains landmark on geocoded addresses in local mode', async () => {
    const maps = new MapsService(config({ NODE_ENV: 'development' }));
    const geocoded = await maps.geocode({
      address: '1 Allen Avenue',
      city: 'Ikeja',
      state: 'Lagos',
      country: 'NG',
      landmark: 'City Mall',
    });
    expect(geocoded.landmark).toBe('City Mall');
    expect(geocoded.latitude).toBeTypeOf('number');
  });

  it('returns local address suggestions outside production when no key is configured', async () => {
    const maps = new MapsService(config({ NODE_ENV: 'development' }));
    const suggestions = await maps.placeAutocomplete('Allen Avenue Ikeja');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.placeId).toMatch(/^local:/);
    const details = await maps.placeDetails(suggestions[0]!.placeId);
    expect(details.formattedAddress).toContain('Allen Avenue Ikeja');
    expect(details.country).toBe('NG');
  });

  it('fails closed in production when Google Maps is not configured', async () => {
    const maps = new MapsService(config({ NODE_ENV: 'production' }));
    await expect(
      maps.geocode({
        address: '1 Allen Avenue',
        city: 'Ikeja',
        state: 'Lagos',
        country: 'NG',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
