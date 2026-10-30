import { Global, Module } from '@nestjs/common';
import { RiderBackendService } from './rider-backend.service.js';

@Global()
@Module({ providers: [RiderBackendService], exports: [RiderBackendService] })
export class RiderModule {}
