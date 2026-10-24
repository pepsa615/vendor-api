import { Module } from '@nestjs/common';
import { ProvisioningService } from './provisioning.service.js';
import { ProvisioningWorker } from './provisioning.worker.js';

@Module({
  providers: [ProvisioningService, ProvisioningWorker],
  exports: [ProvisioningService],
})
export class ProvisioningModule {}
