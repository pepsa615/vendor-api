import { Module } from '@nestjs/common';
import { EmailWorker } from './email.worker.js';
@Module({ providers: [EmailWorker], exports: [EmailWorker] })
export class EmailModule {}
