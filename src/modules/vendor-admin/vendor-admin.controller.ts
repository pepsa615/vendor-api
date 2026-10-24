import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  AdminReviewGuard,
  type AdminActor,
} from '../admin-review/admin-review.guard.js';
import { VendorAdminService } from './vendor-admin.service.js';
import { AdminReviewService } from '../admin-review/admin-review.service.js';

type AdminRequest = Request & { adminActor: AdminActor };

const operations = [
  ['overview-read', 'GET', 'vendor.dashboard.read', 'low'],
  ['vendors-list', 'GET', 'vendor.businesses.read', 'medium'],
  ['vendors-detail', 'GET', 'vendor.businesses.read', 'medium'],
  ['operations-read', 'GET', 'vendor.operations.read', 'medium'],
  ['performance-read', 'GET', 'vendor.performance.read', 'medium'],
  ['correlation-search', 'GET', 'vendor.operations.read', 'high'],
  ['operational-health-read', 'GET', 'vendor.exceptions.operate', 'high'],
  ['finance-read', 'GET', 'vendor.finance.read', 'high'],
  ['exceptions-read', 'GET', 'vendor.exceptions.operate', 'high'],
  ['exception-resolve', 'POST', 'vendor.exceptions.operate', 'high'],
  ['delivery-replay', 'POST', 'vendor.exceptions.operate', 'high'],
  ['audit-read', 'GET', 'vendor.audit.read', 'medium'],
  ['reviews-read', 'GET', 'vendor.businesses.read', 'medium'],
  ['vendor-application-review', 'POST', 'vendor.businesses.review', 'high'],
  ['dispatchers-read', 'GET', 'vendor.dispatchers.review', 'high'],
  ['vendor-suspend', 'POST', 'vendor.businesses.status', 'critical'],
  ['vendor-reactivate', 'POST', 'vendor.businesses.status', 'critical'],
  ['vendor-dispatch-freeze', 'POST', 'vendor.businesses.status', 'critical'],
  ['vendor-dispatch-unfreeze', 'POST', 'vendor.businesses.status', 'critical'],
  ['sessions-revoke', 'POST', 'vendor.businesses.status', 'critical'],
  ['provisioning-list', 'GET', 'vendor.integrations.payment.read', 'medium'],
  [
    'provisioning-retry',
    'POST',
    'vendor.integrations.payment.manage',
    'critical',
  ],
  ['fee-policies-list', 'GET', 'vendor.fees.read', 'medium'],
  ['fee-policy-simulate', 'POST', 'vendor.fees.read', 'medium'],
  ['fee-policy-create', 'POST', 'vendor.fees.manage', 'critical'],
  ['fee-policy-activate', 'POST', 'vendor.fees.manage', 'critical'],
  ['fee-policy-retire', 'POST', 'vendor.fees.manage', 'critical'],
  ['fee-assessment-adjust', 'POST', 'vendor.fees.manage', 'critical'],
  ['fee-report', 'GET', 'vendor.finance.read', 'high'],
] as const;

@UseGuards(AdminReviewGuard)
@Controller({ path: 'internal/admin/v1', version: VERSION_NEUTRAL })
export class VendorAdminController {
  constructor(
    private readonly service: VendorAdminService,
    private readonly reviews: AdminReviewService,
  ) {}

  @Get('health') health() {
    return { status: 'available', checkedAt: new Date().toISOString() };
  }
  @Get('platform-capabilities') capabilities() {
    return {
      version: '1',
      operations: operations.map(([key, method, permission, risk]) => ({
        key,
        method,
        permission,
        risk,
      })),
    };
  }
  @Get('operations/:operation') async read(
    @Req() request: AdminRequest,
    @Param('operation') operation: string,
    @Query() query: Record<string, string>,
  ) {
    this.authorize(request.adminActor, operation, 'GET');
    const params = new URLSearchParams(query);
    await this.service.auditRead(
      request.adminActor.actorId,
      operation,
      request.adminActor.requestId,
      params.get('vendorId') ?? undefined,
    );
    if (operation === 'overview-read') return this.service.overview();
    if (operation === 'vendors-list')
      return this.service.vendors(params, request.adminActor.vendorIds);
    if (operation === 'vendors-detail') {
      const id = params.get('vendorId');
      if (!id) throw new BadRequestException('vendorId is required');
      this.assertVendorScope(request.adminActor, id);
      return this.service.vendor(id);
    }
    if (operation === 'provisioning-list')
      return this.service.provisioningList(request.adminActor.vendorIds);
    if (operation === 'performance-read')
      return this.service.performance(
        Number(params.get('days') ?? 30),
        request.adminActor.vendorIds,
      );
    if (operation === 'correlation-search')
      return this.service.correlationSearch(
        params.get('q') ?? '',
        request.adminActor.vendorIds,
      );
    if (operation === 'operational-health-read')
      return this.service.operationalHealth(request.adminActor.vendorIds);
    if (operation === 'fee-policies-list')
      return this.service.feePolicies(request.adminActor.vendorIds);
    if (operation === 'fee-report') {
      const vendorId = params.get('vendorId') ?? undefined;
      if (vendorId) this.assertVendorScope(request.adminActor, vendorId);
      return this.service.feeReport(vendorId);
    }
    if (
      [
        'operations-read',
        'finance-read',
        'exceptions-read',
        'audit-read',
        'reviews-read',
        'dispatchers-read',
      ].includes(operation)
    )
      return this.service.workbench(
        operation.replace('-read', '') as never,
        request.adminActor.vendorIds,
      );
    throw new NotFoundException('Admin operation not found');
  }
  @Post('operations/:operation') async mutate(
    @Req() request: AdminRequest,
    @Param('operation') operation: string,
    @Body() body: Record<string, unknown>,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    this.authorize(request.adminActor, operation, 'POST');
    if (!idempotencyKey?.trim())
      throw new BadRequestException('Idempotency-Key is required');
    if (!requestId || requestId !== request.adminActor.requestId)
      throw new BadRequestException('Correlated request ID is required');
    const vendorId = String(body.vendorId ?? '');
    if (vendorId) this.assertVendorScope(request.adminActor, vendorId);
    const reason = String(body.reason ?? '');
    if (!reason.trim()) throw new BadRequestException('Reason is required');
    const capability = operations.find(
      ([key, method]) => key === operation && method === 'POST',
    );
    if (capability?.[3] === 'critical') {
      if (!request.adminActor.mfaVerified)
        throw new ForbiddenException('Recent MFA evidence is required');
      if (!request.adminActor.approvalId)
        throw new ForbiddenException(
          'Approved dual-control evidence is required',
        );
      if (
        body.approvalReference &&
        body.approvalReference !== request.adminActor.approvalId
      )
        throw new ForbiddenException(
          'Approval reference does not match actor evidence',
        );
      body.approvalReference = request.adminActor.approvalId;
    }
    return this.service.idempotentMutation(
      request.adminActor.actorId,
      operation,
      idempotencyKey,
      body,
      async () => {
        if (operation === 'vendor-application-review')
          return this.reviews.decide(
            String(body.applicationId ?? ''),
            request.adminActor.actorId,
            idempotencyKey,
            {
              decision: body.decision as 'APPROVE' | 'REJECT',
              reason,
              correctionFields: Array.isArray(body.correctionFields)
                ? body.correctionFields.map(String)
                : undefined,
            },
            request.adminActor.requestId,
          );
        if (operation === 'vendor-suspend')
          return this.service.setStatus(
            vendorId,
            request.adminActor.actorId,
            'SUSPENDED',
            reason,
          );
        if (operation === 'vendor-reactivate')
          return this.service.setStatus(
            vendorId,
            request.adminActor.actorId,
            'APPROVED',
            reason,
          );
        if (operation === 'vendor-dispatch-freeze')
          return this.service.setDispatchFreeze(
            vendorId,
            request.adminActor.actorId,
            true,
            reason,
          );
        if (operation === 'vendor-dispatch-unfreeze')
          return this.service.setDispatchFreeze(
            vendorId,
            request.adminActor.actorId,
            false,
            reason,
          );
        if (operation === 'sessions-revoke')
          return this.service.revokeSessions(
            vendorId,
            request.adminActor.actorId,
            reason,
          );
        if (operation === 'provisioning-retry')
          return this.service.provisioningRetry(vendorId);
        if (operation === 'exception-resolve')
          return this.service.resolveException(
            String(body.caseId ?? ''),
            request.adminActor.actorId,
            reason,
            request.adminActor.requestId,
          );
        if (operation === 'delivery-replay')
          return this.service.replayDelivery(
            String(body.eventId ?? ''),
            request.adminActor.actorId,
            reason,
            request.adminActor.requestId,
          );
        if (operation === 'fee-policy-create')
          return this.service.feePolicyCreate(
            request.adminActor.actorId,
            body as never,
          );
        if (operation === 'fee-policy-simulate')
          return this.service.feePolicySimulate(body as never);
        if (operation === 'fee-policy-activate')
          return this.service.feePolicyActivate(
            request.adminActor.actorId,
            String(body.policyId ?? ''),
            body as never,
          );
        if (operation === 'fee-policy-retire')
          return this.service.feePolicyRetire(
            request.adminActor.actorId,
            String(body.policyId ?? ''),
            body as never,
          );
        if (operation === 'fee-assessment-adjust')
          return this.service.feeAssessmentAdjust(
            request.adminActor.actorId,
            String(body.assessmentId ?? ''),
            body as never,
          );
        throw new NotFoundException('Admin operation not found');
      },
    );
  }
  private authorize(
    actor: AdminActor,
    operation: string,
    method: 'GET' | 'POST',
  ) {
    const capability = operations.find(
      ([key, candidate]) => key === operation && candidate === method,
    );
    if (!capability) throw new NotFoundException('Admin operation not found');
    if (
      actor.actorId !== 'system' &&
      !actor.permissions.includes(capability[2])
    )
      throw new ForbiddenException(`${capability[2]} permission required`);
  }
  private assertVendorScope(actor: AdminActor, vendorId: string) {
    if (actor.vendorIds?.length && !actor.vendorIds.includes(vendorId))
      throw new ForbiddenException(
        'Vendor scope does not permit this resource',
      );
  }
}
