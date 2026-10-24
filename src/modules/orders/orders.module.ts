import { Module } from '@nestjs/common';
import {
  InternalPaymentAccountController,
  OrdersController,
  PaymentWebhookController,
  PublicOrdersController,
} from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AccountModule } from '../account/account.module.js';
import { CheckoutReconciliationWorker } from './checkout-reconciliation.worker.js';

@Module({
  imports: [NotificationsModule, AccountModule],
  controllers: [
    InternalPaymentAccountController,
    OrdersController,
    PublicOrdersController,
    PaymentWebhookController,
  ],
  providers: [OrdersService, CheckoutReconciliationWorker],
})
export class OrdersModule {}
