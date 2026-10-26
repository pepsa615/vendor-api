import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptSensitive } from '../../common/security/crypto.js';
import { ProvisioningService } from './provisioning.service.js';

describe('ProvisioningService', () => {
  beforeEach(() => {
    process.env.KYC_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 9).toString(
      'base64',
    );
  });

  it('exports approved documents and creates exactly one Payment identity', async () => {
    const payment = {
      importKycDocument: vi
        .fn()
        .mockResolvedValueOnce('pay-doc-nin')
        .mockResolvedValueOnce('pay-doc-address'),
      createWallet: vi.fn().mockResolvedValue({
        user_id: '11111111-1111-4111-8111-111111111111',
        wallet_id: '22222222-2222-4222-8222-222222222222',
        settlement_wallet_id: '33333333-3333-4333-8333-333333333333',
      }),
    };
    const saga = {
      id: 'saga-1',
      tenantId: '44444444-4444-4444-8444-444444444444',
      applicationId: '55555555-5555-4555-8555-555555555555',
      attempts: 1,
      vendor: { businessName: 'Vendor Ltd', phone: '+2348012345678' },
      approvedKycSnapshot: {
        fullName: 'Ada Okafor',
        phone: '+2348012345678',
        address: '10 Marina Road',
        dateOfBirth: '1990-01-01',
        encryptedNin: encryptSensitive('12345678901'),
        documents: [
          {
            type: 'proof_of_nin',
            objectKey: 'clean/nin',
            contentType: 'image/png',
            contentLength: 10,
            checksumSha256: 'a'.repeat(64),
          },
          {
            type: 'proof_of_address',
            objectKey: 'clean/address',
            contentType: 'application/pdf',
            contentLength: 20,
            checksumSha256: 'b'.repeat(64),
          },
        ],
      },
    };
    const tx = {
      vendor: { update: vi.fn() },
      vendorProvisioningSaga: {
        update: vi.fn().mockResolvedValue({ status: 'ACTIVE' }),
      },
    };
    const db = {
      vendorProvisioningSaga: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(saga),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const storage = {
      signedDownload: vi.fn(
        async (key: string) => `https://storage.test/${key}`,
      ),
    };
    const result = await new ProvisioningService(
      db as never,
      payment as never,
      storage as never,
    ).process('saga-1');
    expect(result).toEqual({ status: 'ACTIVE' });
    expect(payment.importKycDocument).toHaveBeenCalledTimes(2);
    expect(payment.createWallet).toHaveBeenCalledTimes(1);
    expect(payment.createWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        kyc: expect.objectContaining({
          full_name: 'Vendor Ltd',
          phone_number: '+2348012345678',
          nin: '12345678901',
          proof_of_nin_document_id: 'pay-doc-nin',
          proof_of_address_document_id: 'pay-doc-address',
        }),
      }),
      'vendor-wallet:44444444-4444-4444-8444-444444444444:55555555-5555-4555-8555-555555555555',
    );
  });

  it('normalizes Nigerian numbers and safely falls back when snapshot phone is malformed', async () => {
    const { normalizeE164Phone } = await import('./provisioning.service.js');
    expect(normalizeE164Phone('08050991312')).toBe('+2348050991312');
    expect(normalizeE164Phone('8050991312')).toBe('+2348050991312');
    expect(normalizeE164Phone('+2348050991312')).toBe('+2348050991312');
    expect(normalizeE164Phone('Princeoage@915', '08050991312')).toBe(
      '+2348050991312',
    );
    expect(normalizeE164Phone('invalid', '+2349029566770')).toBe(
      '+2349029566770',
    );
  });
});
