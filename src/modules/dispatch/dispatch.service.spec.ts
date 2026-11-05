import { describe, expect, it } from 'vitest';
import {
  canTransitionDispatch,
  catchUpStatuses,
  mapPepsaOrderEventToProvider,
  suggestedPayout,
} from './dispatch.service.js';

describe('M5 dispatch policy', () => {
  it('allows only forward provider transitions and pending vendor cancellation', () => {
    expect(canTransitionDispatch('PENDING_MATCH', 'PAIRED')).toBe(true);
    expect(canTransitionDispatch('PENDING_MATCH', 'CANCELLED')).toBe(true);
    expect(canTransitionDispatch('PAIRED', 'PICKED_UP')).toBe(true);
    expect(canTransitionDispatch('PICKED_UP', 'DELIVERED')).toBe(true);
    expect(canTransitionDispatch('DELIVERED', 'COMPLETED')).toBe(true);
    expect(canTransitionDispatch('PICKED_UP', 'PAIRED')).toBe(false);
    expect(canTransitionDispatch('COMPLETED', 'CANCELLED')).toBe(false);
  });

  it('fills skipped statuses when a later webhook arrives first', () => {
    expect(catchUpStatuses('PENDING_MATCH', 'COMPLETED')).toEqual([
      'PAIRED',
      'PICKED_UP',
      'DELIVERED',
      'COMPLETED',
    ]);
    expect(catchUpStatuses('PAIRED', 'DELIVERED')).toEqual([
      'PICKED_UP',
      'DELIVERED',
    ]);
    expect(catchUpStatuses('DELIVERED', 'PAIRED')).toEqual([]);
  });

  it('calculates exact minor-unit payout suggestions from basis points', () => {
    expect(suggestedPayout(10_000, 9_000)).toBe(9_000);
    expect(suggestedPayout(101, 5_000)).toBe(51);
  });

  it('maps pepsa-order dispatch.assigned to PAIRED for vendor status sync', () => {
    expect(
      mapPepsaOrderEventToProvider({
        id: 'e1',
        type: 'dispatch.assigned',
        version: 1,
        aggregateId: 'ship-1',
        occurredAt: '2026-01-01T00:00:00.000Z',
        data: { shipmentId: 'ship-1' },
      })?.type,
    ).toBe('PAIRED');
  });
});
