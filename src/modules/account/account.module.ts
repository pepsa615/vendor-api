import { Module } from '@nestjs/common';
import { AccountController } from './account.controller.js';
import { AccountService } from './account.service.js';
import { AccountReconciliationWorker } from './account-reconciliation.worker.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
@Module({
  imports: [NotificationsModule],
  controllers: [AccountController],
  providers: [AccountService, AccountReconciliationWorker],
  exports: [AccountService],
})
export class AccountModule {}
