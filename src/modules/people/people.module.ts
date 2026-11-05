import { Module } from '@nestjs/common';
import {
  CustomersController,
  DispatchersController,
  InternalDispatcherReviewController,
  InternalRiderPresenceController,
} from './people.controller.js';
import { PeopleService } from './people.service.js';
import { RiderPresenceGuard } from './rider-presence.guard.js';

@Module({
  controllers: [
    CustomersController,
    DispatchersController,
    InternalDispatcherReviewController,
    InternalRiderPresenceController,
  ],
  providers: [PeopleService, RiderPresenceGuard],
  exports: [PeopleService],
})
export class PeopleModule {}
