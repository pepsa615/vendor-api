import { Module } from '@nestjs/common';
import { DispatcherProvisioningService } from './dispatcher-provisioning.service.js';
import { DispatcherProvisioningWorker } from './dispatcher-provisioning.worker.js';

@Module({
  providers: [DispatcherProvisioningService, DispatcherProvisioningWorker],
  exports: [DispatcherProvisioningService],
})
export class DispatcherProvisioningModule {}
