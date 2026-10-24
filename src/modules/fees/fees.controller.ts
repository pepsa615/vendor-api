import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  AdminReviewGuard,
  type AdminActor,
} from '../admin-review/admin-review.guard.js';
import {
  ActivateFeePolicyDto,
  AdjustFeeAssessmentDto,
  CreateFeePolicyDto,
  RetireFeePolicyDto,
  SimulateFeeDto,
} from './fees.dto.js';
import { FeesService } from './fees.service.js';
import { RequireAdminPermission } from '../admin-review/admin-permission.decorator.js';

type AdminRequest = Request & { adminActor: AdminActor };

@UseGuards(AdminReviewGuard)
@Controller({ path: 'internal/admin/v1/fees', version: VERSION_NEUTRAL })
export class FeesController {
  constructor(private readonly fees: FeesService) {}
  @RequireAdminPermission('vendor.fees.read')
  @Get('policies')
  list() {
    return this.fees.list();
  }
  @RequireAdminPermission('vendor.fees.manage')
  @Post('policies')
  create(@Req() request: AdminRequest, @Body() body: CreateFeePolicyDto) {
    this.requireCritical(request.adminActor);
    return this.fees.create(request.adminActor.actorId, body);
  }
  @RequireAdminPermission('vendor.fees.manage')
  @Post('policies/:id/activate')
  activate(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() body: ActivateFeePolicyDto,
  ) {
    this.requireCritical(request.adminActor);
    return this.fees.activate(request.adminActor.actorId, id, body);
  }
  @RequireAdminPermission('vendor.fees.manage')
  @Post('policies/:id/retire')
  retire(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() body: RetireFeePolicyDto,
  ) {
    this.requireCritical(request.adminActor);
    return this.fees.retire(request.adminActor.actorId, id, body);
  }
  @RequireAdminPermission('vendor.fees.manage')
  @Post('assessments/:id/adjust')
  adjust(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() body: AdjustFeeAssessmentDto,
  ) {
    this.requireCritical(request.adminActor);
    return this.fees.adjust(request.adminActor.actorId, id, body);
  }
  @RequireAdminPermission('vendor.finance.read')
  @Get('report')
  report() {
    return this.fees.report();
  }
  @RequireAdminPermission('vendor.fees.read')
  @Post('simulate')
  simulate(@Body() body: SimulateFeeDto) {
    return this.fees.simulate(body);
  }
  private requireCritical(actor: AdminActor) {
    if (!actor.mfaVerified || !actor.approvalId)
      throw new ForbiddenException(
        'MFA and approved dual control are required',
      );
  }
}
