import { BadRequestException } from '@nestjs/common';
import { PeopleService } from './people.service.js';

const validDispatcher = {
  firstName: 'Ada',
  lastName: 'Okafor',
  email: 'ada@example.com',
  phone: '08012345678',
  dateOfBirth: '1994-06-12',
  gender: 'FEMALE',
  identityType: 'NIN' as const,
  identityNumber: '12345678901',
  homeAddress: '12 Main Street',
  state: 'Lagos',
  city: 'Ikeja',
  termsAccepted: true,
  engagementType: 'STAFF',
  vehicleType: 'MOTORCYCLE',
  vehicleBrand: 'Honda',
  plateNumber: 'ABC-123XY',
  vehicleRegistrationDate: '2025-01-01',
  guarantorName: 'Tola Okafor',
  guarantorPhone: '08098765432',
  guarantorNin: '10987654321',
  guarantorAddress: '14 Allen Avenue, Ikeja',
  revenueSharePct: 80,
};

describe('PeopleService dispatcher policy', () => {
  const service = new PeopleService(
    {} as never,
    {} as never,
    {} as never,
    { lookupByPhone: async () => null } as never,
  );

  it('requires vehicle details for motorized dispatchers', async () => {
    await expect(
      service.createDispatcher('tenant', 'actor', {
        ...validDispatcher,
        vehicleBrand: undefined,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires recorded terms acceptance', async () => {
    await expect(
      service.createDispatcher('tenant', 'actor', {
        ...validDispatcher,
        termsAccepted: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires an 11-digit guarantor NIN', async () => {
    await expect(
      service.createDispatcher('tenant', 'actor', {
        ...validDispatcher,
        guarantorNin: '1234',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires the guarantor address', async () => {
    await expect(
      service.createDispatcher('tenant', 'actor', {
        ...validDispatcher,
        guarantorAddress: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('encrypts and redacts the guarantor NIN', () => {
    const revision = (
      service as unknown as {
        revisionData(
          dispatcherId: string,
          version: number,
          input: typeof validDispatcher,
        ): Record<string, unknown>;
        safeRevision(input: Record<string, unknown>): Record<string, unknown>;
      }
    ).revisionData('dispatcher-id', 1, validDispatcher);

    expect(revision.encryptedGuarantorNin).not.toBe(
      validDispatcher.guarantorNin,
    );
    expect(revision.guarantorNinFingerprint).toHaveLength(64);
    const safe = (
      service as unknown as {
        safeRevision(input: Record<string, unknown>): Record<string, unknown>;
      }
    ).safeRevision({ ...revision, documents: [] });
    expect(safe).not.toHaveProperty('encryptedGuarantorNin');
    expect(safe).not.toHaveProperty('guarantorNinFingerprint');
    expect(safe.guarantorNinMasked).toBe('••••••••');
  });
});
