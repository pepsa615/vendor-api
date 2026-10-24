const MONEY = /^-?\d+(?:\.\d{1,2})?$/;
export function moneyToMinorUnits(value: string): bigint {
  if (!MONEY.test(value))
    throw new TypeError(
      'Money must be a decimal string with at most two decimal places',
    );
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace('-', '').split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -minor : minor;
}
export function minorUnitsToMoney(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
