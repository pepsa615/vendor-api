import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  HEALTH_READINESS,
  type HealthReadinessPort,
} from '../domain/health-readiness.port.js';
@Injectable()
export class HealthService {
  constructor(
    @Inject(HEALTH_READINESS) private readonly readiness: HealthReadinessPort,
  ) {}
  async ready() {
    try {
      await this.readiness.check();
      return { status: 'ready' as const };
    } catch {
      throw new ServiceUnavailableException('Database is not ready');
    }
  }
}
