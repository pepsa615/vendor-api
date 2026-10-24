import { Module } from '@nestjs/common';
import { ManifestsController } from './manifests.controller.js';
import { ManifestsService } from './manifests.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [NotificationsModule],
  controllers: [ManifestsController],
  providers: [ManifestsService],
})
export class ManifestsModule {}
