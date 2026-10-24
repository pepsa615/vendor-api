import { Global, Module } from '@nestjs/common';
import { PaymentService } from './payment.service.js';

@Global()
@Module({ providers: [PaymentService], exports: [PaymentService] })
export class PaymentModule {}
