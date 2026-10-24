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
  revenueSharePct: 80,
};

describe('PeopleService dispatcher policy', () => {
  const service = new PeopleService({} as never, {} as never, {} as never);

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
});
