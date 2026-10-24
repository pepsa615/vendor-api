import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { HealthService } from './application/health.service.js';
import { HEALTH_READINESS } from './domain/health-readiness.port.js';
import { DatabaseHealthAdapter } from './infrastructure/database-health.adapter.js';
@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    { provide: HEALTH_READINESS, useClass: DatabaseHealthAdapter },
  ],
})
export class HealthModule {}
