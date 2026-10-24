import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './application/health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}
  @Get('live')
  @ApiOperation({ summary: 'Process liveness' })
  live() {
    return { status: 'ok' as const };
  }
  @Get('ready')
  @ApiOperation({ summary: 'Dependency readiness' })
  async ready() {
    return this.health.ready();
  }
}
