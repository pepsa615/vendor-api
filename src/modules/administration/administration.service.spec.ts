import { describe, expect, it, vi } from 'vitest';
import { AdministrationService } from './administration.service.js';

const vendor = {
  id: 'tenant',
  type: 'COMPANY',
  status: 'APPROVED',
  businessName: 'Zuma Express',
  email: 'owner@example.com',
  phone: '08000000000',
  tagline: null,
  description: null,
  logoObjectKey: null,
  rejectionNotes: null,
  publicSlug: 'zuma-express',
  paymentProvisioning: 'ACTIVE',
  externalCheckoutUserId: 'payment-user',
  paymentWalletId: 'wallet',
  pricingSettings: [
    { id: 'pricing', tiers: ['1', '2', '3', '4'].map((id) => ({ id })) },
  ],
};

describe('AdministrationService profile order link', () => {
  it('enables the public link only when approval, pricing, and payment are ready', async () => {
    const service = new AdministrationService(
      {
        vendor: { findUniqueOrThrow: vi.fn().mockResolvedValue(vendor) },
      } as never,
      {} as never,
      {} as never,
    );
    const result = await service.profile('tenant');
    expect(result.publicOrder).toEqual({
      publicSlug: 'zuma-express',
      path: '/order/zuma-express',
      enabled: true,
      blockers: [],
    });
  });

  it('returns every safe readiness blocker without exposing payment identifiers', async () => {
    const service = new AdministrationService(
      {
        vendor: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            ...vendor,
            status: 'UNDER_REVIEW',
            paymentProvisioning: 'PENDING',
            externalCheckoutUserId: null,
            paymentWalletId: null,
            pricingSettings: [],
          }),
        },
      } as never,
      {} as never,
      {} as never,
    );
    const result = await service.profile('tenant');
    expect(result.publicOrder.enabled).toBe(false);
    expect(result.publicOrder.blockers).toEqual([
      'VENDOR_NOT_APPROVED',
      'PRICING_NOT_CONFIGURED',
      'PAYMENT_NOT_READY',
    ]);
    expect(result).not.toHaveProperty('externalCheckoutUserId');
    expect(result).not.toHaveProperty('paymentWalletId');
  });
});
