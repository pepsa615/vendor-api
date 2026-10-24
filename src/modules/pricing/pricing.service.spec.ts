import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PricingService } from './pricing.service.js';

describe('PricingService tier policy', () => {
  const service = new PricingService({} as never, {} as never, {} as never);
  const tiers = [
    { tierNumber: 1, minMetres: 0, maxMetres: 5000, discountBps: 100 },
    { tierNumber: 2, minMetres: 5000, maxMetres: 10000, discountBps: 200 },
    { tierNumber: 3, minMetres: 10000, maxMetres: 15000, discountBps: 300 },
    { tierNumber: 4, minMetres: 15000, maxMetres: 25000, discountBps: 400 },
  ];
  it('accepts exactly four continuous metre ranges', () => {
    expect(service.validate({ pricePerKmMinor: 10000, tiers })).toEqual(tiers);
  });
  it('rejects gaps and overlaps', () => {
    expect(() =>
      service.validate({
        pricePerKmMinor: 10000,
        tiers: tiers.map((tier, index) =>
          index === 2 ? { ...tier, minMetres: 10001 } : tier,
        ),
      }),
    ).toThrow(BadRequestException);
  });
  it('rounds the final discounted amount only once to minor units', () => {
    expect(service.calculateAmounts(1555, 12_345, 333)).toEqual({
      baseAmountMinor: 19_196,
      finalAmountMinor: 18_557,
    });
  });

  it('selects the same tier band used for customer quotes', () => {
    expect(service.tierForDistance(4_999, tiers)?.tierNumber).toBe(1);
    expect(service.tierForDistance(15_000, tiers)?.tierNumber).toBe(4);
    expect(service.tierForDistance(25_001, tiers)).toBeUndefined();
  });
});
