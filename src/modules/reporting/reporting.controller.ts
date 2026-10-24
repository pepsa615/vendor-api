import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthenticatedActor } from '../../integrations/iam/authenticated-actor.js';
import { IamAuthGuard } from '../../integrations/iam/iam-auth.guard.js';
import { PermissionGuard } from '../../integrations/iam/permission.guard.js';
import { RequirePermission } from '../../integrations/iam/require-permission.decorator.js';
import { RangeQueryDto, SearchQueryDto } from './reporting.dto.js';
import { ReportingService } from './reporting.service.js';
type ActorRequest = Request & { actor: AuthenticatedActor };

@ApiTags('Reporting')
@ApiBearerAuth()
@UseGuards(IamAuthGuard, PermissionGuard)
@Controller({ version: '1' })
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}
  @Get('dashboard') @RequirePermission('dashboard.read') dashboard(
    @Req() r: ActorRequest,
    @Query() q: RangeQueryDto,
  ) {
    return this.reporting.dashboard(r.actor.tenantId, q);
  }
  @Get('reports/operations') @RequirePermission('operations.read') operations(
    @Req() r: ActorRequest,
    @Query() q: RangeQueryDto,
  ) {
    return this.reporting.operations(r.actor.tenantId, q);
  }
  @Get('reports/operations.csv')
  @RequirePermission('operations.read')
  async operationsCsv(
    @Req() r: ActorRequest,
    @Query() q: RangeQueryDto,
    @Res() res: Response,
  ) {
    res
      .type('text/csv')
      .attachment('operations-report.csv')
      .send(await this.reporting.operationsCsv(r.actor.tenantId, q));
  }
  @Get('reports/settlements') @RequirePermission('settlement.read') settlements(
    @Req() r: ActorRequest,
    @Query() q: RangeQueryDto,
  ) {
    return this.reporting.settlements(r.actor.tenantId, q);
  }
  @Get('reports/settlements.csv')
  @RequirePermission('settlement.read')
  async settlementsCsv(
    @Req() r: ActorRequest,
    @Query() q: RangeQueryDto,
    @Res() res: Response,
  ) {
    res
      .type('text/csv')
      .attachment('settlement-report.csv')
      .send(await this.reporting.settlementsCsv(r.actor.tenantId, q));
  }
  @Get('search') search(@Req() r: ActorRequest, @Query() q: SearchQueryDto) {
    return this.reporting.search(
      r.actor.tenantId,
      r.actor.permissions,
      q.q.trim(),
    );
  }
}
