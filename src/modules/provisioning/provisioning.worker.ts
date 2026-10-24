import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import { ProvisioningService } from './provisioning.service.js';

@Injectable()
export class ProvisioningWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(
    private readonly db: PrismaService,
    private readonly provisioning: ProvisioningService,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(
      () => void this.run(),
      Number(process.env.PROVISIONING_INTERVAL_MS ?? 15_000),
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async run() {
    const due = await this.db.vendorProvisioningSaga.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED_RETRYABLE'] },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
      },
      select: { id: true },
      take: 20,
    });
    await Promise.all(
      due.map(({ id }) => this.provisioning.process(id).catch(() => undefined)),
    );
  }
}
