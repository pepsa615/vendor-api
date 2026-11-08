import { Module } from '@nestjs/common';
import { AdministrationService } from './administration.service.js';
import {
  AuditController,
  InternalPartnerProfileController,
  ProfileController,
  RolesController,
  StaffController,
} from './administration.controller.js';
import { PeopleModule } from '../people/people.module.js';
@Module({
  imports: [PeopleModule],
  controllers: [
    InternalPartnerProfileController,
    ProfileController,
    RolesController,
    StaffController,
    AuditController,
  ],
  providers: [AdministrationService],
})
export class AdministrationModule {}
