import { Module } from '@nestjs/common';
import { DispatchIntegrationsModule } from '../../integrations/dispatch/dispatch-integrations.module.js';
import {
  DispatchController,
  DispatchWebhookController,
  PepsaOrderWebhookController,
} from './dispatch.controller.js';
import { DispatchService } from './dispatch.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { FeesModule } from '../fees/fees.module.js';
import { PricingModule } from '../pricing/pricing.module.js';

@Module({
  imports: [
    DispatchIntegrationsModule,
    NotificationsModule,
    FeesModule,
    PricingModule,
  ],
  controllers: [
    DispatchController,
    DispatchWebhookController,
    PepsaOrderWebhookController,
  ],
  providers: [DispatchService],
})
export class DispatchModule {}
