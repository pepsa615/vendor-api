import { Module } from '@nestjs/common';
import { AdminReviewModule } from '../admin-review/admin-review.module.js';
import { FeesModule } from '../fees/fees.module.js';
import { ProvisioningModule } from '../provisioning/provisioning.module.js';
import { PeopleModule } from '../people/people.module.js';
import { VendorAdminController } from './vendor-admin.controller.js';
import { VendorAdminService } from './vendor-admin.service.js';

@Module({
  imports: [AdminReviewModule, FeesModule, ProvisioningModule, PeopleModule],
  controllers: [VendorAdminController],
  providers: [VendorAdminService],
})
export class VendorAdminModule {}
