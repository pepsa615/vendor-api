import {
  decryptSensitive,
  encryptSensitive,
  normalizeEmail,
  sha256,
} from './crypto.js';
describe('security primitives', () => {
  it('normalizes identity keys without exposing their source value', () => {
    expect(normalizeEmail(' Owner@Example.COM ')).toBe('owner@example.com');
    expect(sha256('12345678901')).not.toContain('12345678901');
  });
  it('encrypts sensitive KYC values with authenticated encryption', () => {
    const encrypted = encryptSensitive('12345678901');
    expect(encrypted).not.toContain('12345678901');
    expect(decryptSensitive(encrypted)).toBe('12345678901');
    expect(() => decryptSensitive(encrypted.slice(0, -2) + 'aa')).toThrow();
  });
});
