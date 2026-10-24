import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { FeesService } from './fees.service.js';

const policy = (overrides: Record<string, unknown> = {}) => ({
  id: 'policy-1',
  feeCode: 'RUNWAY_DISPATCH',
  scope: 'PLATFORM_DEFAULT',
  tenantId: null,
  version: 1,
  calculationType: 'PERCENTAGE',
  currency: 'NGN',
  flatAmountMinor: null,
  percentageBps: 333,
  minimumAmountMinor: 100,
  maximumAmountMinor: 500,
  tiers: null,
  roundingRule: 'HALF_UP',
  deferralAllowed: true,
  status: 'ACTIVE',
  effectiveFrom: new Date(),
  effectiveTo: null,
  contentHash: 'hash',
  createdById: 'author',
  ...overrides,
});

describe('FeesService policy correctness', () => {
  it('prefers a vendor override and applies rounding and caps', async () => {
    const override = policy({
      id: 'override',
      scope: 'VENDOR_OVERRIDE',
      tenantId: '11111111-1111-4111-8111-111111111111',
    });
    const findFirst = vi.fn().mockResolvedValueOnce(override);
    const result = await new FeesService(
      {
        feePolicyVersion: { findFirst },
      } as never,
      {} as never,
    ).resolve('RUNWAY_DISPATCH', '11111111-1111-4111-8111-111111111111', 1234);
    expect(result.policy.id).toBe('override');
    expect(result.amountMinor).toBe(100);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('calculates a deterministic tiered fee', async () => {
    const tiered = policy({
      calculationType: 'TIERED',
      percentageBps: null,
      minimumAmountMinor: null,
      maximumAmountMinor: null,
      tiers: [{ upToMinor: 10_000, flatAmountMinor: 50, percentageBps: 250 }],
    });
    const result = await new FeesService(
      {
        feePolicyVersion: { findFirst: vi.fn().mockResolvedValue(tiered) },
      } as never,
      {} as never,
    ).resolve('RUNWAY_DISPATCH', undefined, 1000);
    expect(result.amountMinor).toBe(75);
    expect(result.snapshot.tiers).toEqual(tiered.tiers);
  });

  it('requires a different approver for activation', async () => {
    const service = new FeesService(
      {
        feePolicyVersion: { findUnique: vi.fn().mockResolvedValue(policy()) },
      } as never,
      {} as never,
    );
    await expect(
      service.activate('author', 'policy-1', {
        effectiveFrom: new Date(Date.now() + 60_000).toISOString(),
        approvalReference: 'approval-1',
        reason: 'Approved fee',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects overlapping effective intervals', async () => {
    const service = new FeesService(
      {
        feePolicyVersion: {
          findUnique: vi.fn().mockResolvedValue(policy()),
          findFirst: vi.fn().mockResolvedValue({ id: 'overlap' }),
        },
      } as never,
      {} as never,
    );
    await expect(
      service.activate('approver', 'policy-1', {
        effectiveFrom: new Date(Date.now() + 60_000).toISOString(),
        approvalReference: 'approval-1',
        reason: 'Approved fee',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
