import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

export const normalizeEmail = (value: string): string =>
  value.trim().toLowerCase();

export const sha256 = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');

export const randomToken = (bytes = 32): string =>
  randomBytes(bytes).toString('base64url');

export const verificationCode = (): string =>
  String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, '0');

function encryptionKey(): Buffer {
  const encoded = process.env.KYC_ENCRYPTION_KEY_BASE64;
  if (!encoded) {
    if (process.env.NODE_ENV === 'production')
      throw new Error('KYC_ENCRYPTION_KEY_BASE64 is required');
    return createHash('sha256').update('pepsa-vendor-local-only').digest();
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('KYC encryption key must be 32 bytes');
  return key;
}

export function encryptSensitive(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString('base64url'))
    .join('.');
}

export function decryptSensitive(value: string): string {
  const [iv, tag, encrypted] = value
    .split('.')
    .map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !encrypted) throw new Error('Invalid encrypted value');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}
