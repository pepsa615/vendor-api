import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HealthController } from '../src/modules/health/health.controller.js';
import { HealthService } from '../src/modules/health/application/health.service.js';
import { HEALTH_READINESS } from '../src/modules/health/domain/health-readiness.port.js';

describe('health', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: HEALTH_READINESS,
          useValue: { check: vi.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => app.close());
  it('reports liveness', async () =>
    request(app.getHttpServer())
      .get('/api/health/live')
      .expect(200)
      .expect({ status: 'ok' }));
});
