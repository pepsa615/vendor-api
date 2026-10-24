import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';

describe('NotificationsService', () => {
  it('addresses only active users with the required permission', async () => {
    const notification = { upsert: vi.fn() };
    const emailOutbox = { upsert: vi.fn() };
    const db = {
      user: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'allowed',
            email: 'a@example.com',
            roleAssignments: [{ role: { permissions: ['operations.read'] } }],
          },
          {
            id: 'denied',
            email: 'b@example.com',
            roleAssignments: [{ role: { permissions: ['wallet.read'] } }],
          },
        ]),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback({ notification, emailOutbox }),
      ),
    };
    const service = new NotificationsService(db as never);
    await service.emit({
      tenantId: 'tenant',
      permission: 'operations.read',
      type: 'TEST',
      title: 'Title',
      body: 'Body',
      uniqueKey: 'event:1',
      email: true,
    });
    expect(notification.upsert).toHaveBeenCalledTimes(1);
    expect(emailOutbox.upsert).toHaveBeenCalledTimes(1);
  });
});
