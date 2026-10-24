import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OrdersService } from './orders.service.js';

@Injectable()
export class CheckoutReconciliationWorker
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: NodeJS.Timeout;
  constructor(private readonly orders: OrdersService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(
      () => void this.orders.reconcilePendingCheckouts().catch(() => undefined),
      Number(process.env.CHECKOUT_RECONCILIATION_INTERVAL_MS ?? 60_000),
    );
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
