import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import { AccountService } from './account.service.js';

@Injectable()
export class AccountReconciliationWorker
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: NodeJS.Timeout;
  constructor(
    private readonly db: PrismaService,
    private readonly account: AccountService,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(
      () => void this.run().catch(() => undefined),
      Number(process.env.ACCOUNT_RECONCILIATION_INTERVAL_MS ?? 60_000),
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async run() {
    const vendors = await this.db.feeReceivable.findMany({
      where: { status: 'OUTSTANDING' },
      distinct: ['tenantId'],
      select: { tenantId: true },
      take: 100,
    });
    for (const { tenantId } of vendors) {
      try {
        await this.account.reconcileFees(tenantId);
      } catch {
        // A provider or tenant failure must not stop reconciliation for others.
      }
    }
  }
}
