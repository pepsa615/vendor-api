import { Module } from '@nestjs/common';
import { AdministrationService } from './administration.service.js';
import {
  AuditController,
  ProfileController,
  RolesController,
  StaffController,
} from './administration.controller.js';
@Module({
  controllers: [
    ProfileController,
    RolesController,
    StaffController,
    AuditController,
  ],
  providers: [AdministrationService],
})
export class AdministrationModule {}
