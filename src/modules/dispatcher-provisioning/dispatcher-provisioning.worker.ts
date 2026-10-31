import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../core/database/prisma.service.js';
import { DispatcherProvisioningService } from './dispatcher-provisioning.service.js';

@Injectable()
export class DispatcherProvisioningWorker
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: NodeJS.Timeout;
  constructor(
    private readonly db: PrismaService,
    private readonly service: DispatcherProvisioningService,
    private readonly config: ConfigService,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(
      () => void this.run(),
      Number(this.config.get('RIDER_PROVISIONING_INTERVAL_MS') ?? 15_000),
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async run() {
    const due = await this.db.dispatcherProvisioningSaga.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED_RETRYABLE'] },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
      },
      select: { id: true },
      take: 20,
    });
    await Promise.all(
      due.map(({ id }) => this.service.process(id).catch(() => undefined)),
    );
    const active = await this.db.dispatcher.findMany({
      where: { riderProvisioningStatus: 'ACTIVE', riderUserId: { not: null } },
      select: { id: true },
      orderBy: { riderLastSyncedAt: { sort: 'asc', nulls: 'first' } },
      take: 20,
    });
    await Promise.all(
      active.map(({ id }) =>
        this.service.syncAccountStatus(id).catch(() => undefined),
      ),
    );
  }
}
