import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthenticatedActor } from '../../integrations/iam/authenticated-actor.js';
import { IamAuthGuard } from '../../integrations/iam/iam-auth.guard.js';
import { PermissionGuard } from '../../integrations/iam/permission.guard.js';
import { RequirePermission } from '../../integrations/iam/require-permission.decorator.js';
import {
  BatchListQueryDto,
  AssignManifestDispatcherDto,
  ConfirmPreviewDto,
  ManifestActionDto,
  ManifestListQueryDto,
  ManifestPreviewDto,
  ManifestTransitionDto,
  ValidateTrackingIdsDto,
  VendorDirectoryQueryDto,
} from './manifests.dto.js';
import { ManifestsService } from './manifests.service.js';

type ActorRequest = Request & { actor: AuthenticatedActor };

@ApiTags('Batching and manifests')
@ApiBearerAuth()
@UseGuards(IamAuthGuard, PermissionGuard)
@Controller({ path: 'manifests', version: '1' })
export class ManifestsController {
  constructor(private readonly manifests: ManifestsService) {}

  @Post('batches/validate')
  @RequirePermission('manifests.manage')
  validate(@Req() req: ActorRequest, @Body() body: ValidateTrackingIdsDto) {
    return this.manifests.validateBatch(
      req.actor.tenantId,
      req.actor.actorId,
      body,
    );
  }

  @Post('batches')
  @RequirePermission('manifests.manage')
  createBatch(@Req() req: ActorRequest, @Body() body: ConfirmPreviewDto) {
    return this.manifests.createBatch(
      req.actor.tenantId,
      req.actor.actorId,
      body.previewToken,
    );
  }

  @Get('batches')
  @RequirePermission('manifests.read')
  batches(@Req() req: ActorRequest, @Query() query: BatchListQueryDto) {
    return this.manifests.listBatches(req.actor.tenantId, query);
  }

  @Get('batches/:id')
  @RequirePermission('manifests.read')
  batch(@Req() req: ActorRequest, @Param('id') id: string) {
    return this.manifests.batchDetail(req.actor.tenantId, id);
  }

  @Get('vendors')
  @RequirePermission(['manifests.read', 'operations.read'])
  vendors(@Req() req: ActorRequest, @Query() query: VendorDirectoryQueryDto) {
    return this.manifests.directory(req.actor.tenantId, query.search);
  }

  @Post('preview')
  @RequirePermission('manifests.manage')
  preview(@Req() req: ActorRequest, @Body() body: ManifestPreviewDto) {
    return this.manifests.previewManifest(
      req.actor.tenantId,
      req.actor.actorId,
      body,
    );
  }

  @Post()
  @RequirePermission('manifests.manage')
  create(@Req() req: ActorRequest, @Body() body: ConfirmPreviewDto) {
    return this.manifests.createManifest(
      req.actor.tenantId,
      req.actor.actorId,
      body.previewToken,
    );
  }

  @Get()
  @RequirePermission(['manifests.read', 'operations.read'])
  list(@Req() req: ActorRequest, @Query() query: ManifestListQueryDto) {
    return this.manifests.list(req.actor.tenantId, query);
  }

  @Get(':id')
  @RequirePermission(['manifests.read', 'operations.read'])
  detail(@Req() req: ActorRequest, @Param('id') id: string) {
    return this.manifests.detail(req.actor.tenantId, id);
  }

  @Post(':id/revisions/preview')
  @RequirePermission('manifests.manage')
  previewRevision(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Body() body: ManifestPreviewDto,
  ) {
    return this.manifests.previewManifest(
      req.actor.tenantId,
      req.actor.actorId,
      body,
      id,
    );
  }

  @Post(':id/revisions')
  @RequirePermission('manifests.manage')
  revise(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Body() body: ConfirmPreviewDto,
  ) {
    return this.manifests.createManifest(
      req.actor.tenantId,
      req.actor.actorId,
      body.previewToken,
      id,
    );
  }

  @Post(':id/respond')
  @RequirePermission(['manifests.manage', 'operations.manage'])
  respond(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: ManifestActionDto,
  ) {
    return this.manifests.respond(
      req.actor.tenantId,
      req.actor.actorId,
      id,
      body,
      key,
    );
  }

  @Post(':id/status')
  @RequirePermission(['manifests.manage', 'operations.manage'])
  transition(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: ManifestTransitionDto,
  ) {
    return this.manifests.transition(
      req.actor.tenantId,
      req.actor.actorId,
      id,
      body,
      key,
    );
  }

  @Post(':id/dispatcher-assignment')
  @RequirePermission(['manifests.manage', 'operations.manage'])
  assignDispatcher(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: AssignManifestDispatcherDto,
  ) {
    return this.manifests.assignDispatcher(
      req.actor.tenantId,
      req.actor.actorId,
      id,
      body,
      key,
    );
  }

  @Get(':id/waybill')
  @RequirePermission(['manifests.read', 'operations.read'])
  async waybill(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Query('version', new ParseIntPipe({ optional: true }))
    version: number | undefined,
    @Res() response: Response,
  ) {
    const result = await this.manifests.waybill(
      req.actor.tenantId,
      id,
      version,
    );
    response.setHeader('content-type', 'application/pdf');
    response.setHeader(
      'content-disposition',
      `attachment; filename="${result.filename}"`,
    );
    response.send(result.buffer);
  }
}
