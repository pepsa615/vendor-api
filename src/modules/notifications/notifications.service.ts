import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';

export interface NotificationEvent {
  tenantId: string;
  permission: string;
  type: string;
  title: string;
  body: string;
  href?: string;
  uniqueKey: string;
  email?: boolean;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly db: PrismaService) {}

  async emit(event: NotificationEvent) {
    const users = await this.db.user.findMany({
      where: { tenantId: event.tenantId, status: 'ACTIVE' },
      include: { roleAssignments: { include: { role: true } } },
    });
    const recipients = users.filter((user) =>
      user.roleAssignments.some(
        ({ role }) =>
          role.permissions.includes('*') ||
          role.permissions.includes(event.permission),
      ),
    );
    await this.db.$transaction(async (tx) => {
      for (const user of recipients) {
        await tx.notification.upsert({
          where: {
            userId_uniqueKey: { userId: user.id, uniqueKey: event.uniqueKey },
          },
          update: {},
          create: {
            tenantId: event.tenantId,
            userId: user.id,
            type: event.type,
            title: event.title,
            body: event.body,
            href: event.href,
            uniqueKey: event.uniqueKey,
          },
        });
        if (event.email)
          await tx.emailOutbox.upsert({
            where: { uniqueKey: `${user.id}:${event.uniqueKey}` },
            update: {},
            create: {
              recipient: user.email,
              template: 'workflow-notification',
              payload: {
                title: event.title,
                body: event.body,
                href: event.href ?? '',
              },
              uniqueKey: `${user.id}:${event.uniqueKey}`,
            },
          });
      }
    });
  }

  async list(tenantId: string, userId: string, page: number, pageSize: number) {
    const where = { tenantId, userId };
    const [items, total, unread] = await this.db.$transaction([
      this.db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.notification.count({ where }),
      this.db.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return { items, total, unread, page, pageSize };
  }
  unread(tenantId: string, userId: string) {
    return this.db.notification
      .count({ where: { tenantId, userId, readAt: null } })
      .then((count) => ({ count }));
  }
  async read(tenantId: string, userId: string, id: string) {
    const result = await this.db.notification.updateMany({
      where: { id, tenantId, userId },
      data: { readAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Notification not found');
    return { read: true };
  }
  async readAll(tenantId: string, userId: string) {
    const result = await this.db.notification.updateMany({
      where: { tenantId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
