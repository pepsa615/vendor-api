import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../core/database/prisma.service.js';

@Injectable()
export class AuditService {
  constructor(private readonly db: PrismaService) {}
  record(input: {
    tenantId?: string;
    actorId: string;
    action: string;
    subjectId?: string;
    requestId?: string;
    outcome?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.db.auditEvent.create({ data: input });
  }
}
