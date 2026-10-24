import { describe, expect, it } from 'vitest';
import { minorUnitsToMoney, moneyToMinorUnits } from './money.js';
describe('money', () => {
  it('round trips exact decimal strings without floating point', () =>
    expect(minorUnitsToMoney(moneyToMinorUnits('1000.09'))).toBe('1000.09'));
  it('rejects excess precision', () =>
    expect(() => moneyToMinorUnits('1.001')).toThrow());
});
