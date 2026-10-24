import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedActor } from '../../integrations/iam/authenticated-actor.js';
import { IamAuthGuard } from '../../integrations/iam/iam-auth.guard.js';
import { PermissionGuard } from '../../integrations/iam/permission.guard.js';
import { RequirePermission } from '../../integrations/iam/require-permission.decorator.js';
import {
  CreateDispatchDto,
  DispatchListQueryDto,
  DispatchPreviewDto,
  DispatchProviderEventDto,
  OpenDispatchMobilityDto,
} from './dispatch.dto.js';
import { DispatchService } from './dispatch.service.js';

type ActorRequest = Request & { actor: AuthenticatedActor };

@ApiTags('Dispatch')
@ApiBearerAuth()
@UseGuards(IamAuthGuard, PermissionGuard)
@Controller({ path: 'dispatches', version: '1' })
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Post('preview')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['mode'],
      properties: {
        mode: { type: 'string', enum: ['OWN_FLEET', 'GENERAL_POOL'] },
        orderId: { type: 'string' },
        batchId: { type: 'string' },
        dispatcherId: { type: 'string' },
        mobilityMethod: {
          type: 'string',
          enum: [
            'bicycle',
            'motorcycle',
            'tricycle',
            'car',
            'van',
            'truck',
            'large_truck',
          ],
          description: 'Required only when mode is GENERAL_POOL.',
        },
      },
    },
  })
  @RequirePermission('dispatch.manage')
  preview(@Req() req: ActorRequest, @Body() input: DispatchPreviewDto) {
    return this.dispatch.preview(req.actor.tenantId, req.actor.actorId, input);
  }

  @Post()
  @ApiBody({
    schema: {
      type: 'object',
      required: ['previewToken'],
      properties: {
        previewToken: { type: 'string' },
        payoutAmountMinor: { type: 'integer', minimum: 0 },
        stopPayouts: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            required: ['orderId', 'payoutAmountMinor'],
            properties: {
              orderId: { type: 'string' },
              payoutAmountMinor: { type: 'integer', minimum: 0 },
            },
          },
        },
      },
    },
  })
  @RequirePermission('dispatch.manage')
  create(
    @Req() req: ActorRequest,
    @Headers('idempotency-key') key: string,
    @Body() input: CreateDispatchDto,
  ) {
    return this.dispatch.create(
      req.actor.tenantId,
      req.actor.actorId,
      key,
      input,
    );
  }

  @Get()
  @RequirePermission('dispatch.read')
  list(@Req() req: ActorRequest, @Query() query: DispatchListQueryDto) {
    return this.dispatch.list(req.actor.tenantId, query);
  }

  @Get('summary')
  @RequirePermission('operations.read')
  summary(
    @Req() req: ActorRequest,
    @Query('view') view?: 'active' | 'history',
    @Query('mode') mode?: 'OWN_FLEET' | 'GENERAL_POOL',
  ) {
    return this.dispatch.summary(req.actor.tenantId, view, mode);
  }

  @Get(':id')
  @RequirePermission('dispatch.read')
  detail(@Req() req: ActorRequest, @Param('id') id: string) {
    return this.dispatch.detail(req.actor.tenantId, id);
  }

  @Get(':id/tracking')
  @RequirePermission('operations.read')
  tracking(@Req() req: ActorRequest, @Param('id') id: string) {
    return this.dispatch.tracking(req.actor.tenantId, id);
  }

  @Post(':id/open-dispatch-price')
  @RequirePermission('dispatch.manage')
  openDispatchPrice(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Body() body: OpenDispatchMobilityDto,
  ) {
    return this.dispatch.openDispatchPrice(
      req.actor.tenantId,
      id,
      body.mobilityMethod,
    );
  }

  @Post(':id/publish-open-dispatch')
  @RequirePermission('dispatch.manage')
  publishOpenDispatch(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: OpenDispatchMobilityDto,
  ) {
    return this.dispatch.publishToOpenDispatch(
      req.actor.tenantId,
      req.actor.actorId,
      id,
      key,
      body.mobilityMethod,
    );
  }

  @Post(':id/cancel')
  @RequirePermission('dispatch.manage')
  cancel(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.dispatch.cancel(req.actor.tenantId, req.actor.actorId, id, key);
  }
}

@ApiTags('Dispatch provider webhook')
@Throttle({ default: { limit: 100, ttl: 60_000 } })
@Controller({ path: 'webhooks/dispatch', version: '1' })
export class DispatchWebhookController {
  constructor(private readonly dispatch: DispatchService) {}

  @Post()
  event(
    @Headers('x-pepsa-timestamp') timestamp: string,
    @Headers('x-pepsa-signature') signature: string,
    @Body() input: DispatchProviderEventDto,
  ) {
    return this.dispatch.providerEvent(timestamp, signature, input);
  }
}
