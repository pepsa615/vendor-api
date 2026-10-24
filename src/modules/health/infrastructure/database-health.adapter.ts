import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { HealthReadinessPort } from '../domain/health-readiness.port.js';
@Injectable()
export class DatabaseHealthAdapter implements HealthReadinessPort {
  constructor(private readonly database: PrismaService) {}
  async check(): Promise<void> {
    await this.database.$queryRaw`SELECT 1`;
  }
}
