import { Module } from '@nestjs/common';
import {
  CustomersController,
  DispatchersController,
  InternalDispatcherReviewController,
} from './people.controller.js';
import { PeopleService } from './people.service.js';

@Module({
  controllers: [
    CustomersController,
    DispatchersController,
    InternalDispatcherReviewController,
  ],
  providers: [PeopleService],
  exports: [PeopleService],
})
export class PeopleModule {}
