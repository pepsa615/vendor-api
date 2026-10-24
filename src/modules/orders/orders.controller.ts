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
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedActor } from '../../integrations/iam/authenticated-actor.js';
import { IamAuthGuard } from '../../integrations/iam/iam-auth.guard.js';
import { PermissionGuard } from '../../integrations/iam/permission.guard.js';
import { RequirePermission } from '../../integrations/iam/require-permission.decorator.js';
import {
  CreateCustomerOrderDto,
  CreateVendorOrderDto,
  OrderListQueryDto,
  PaymentAccountDto,
  PaymentWebhookDto,
} from './orders.dto.js';
import { OrdersService } from './orders.service.js';
import {
  AdminReviewGuard,
  type AdminActor,
} from '../admin-review/admin-review.guard.js';
import { RequireAdminPermission } from '../admin-review/admin-permission.decorator.js';

type ActorRequest = Request & { actor: AuthenticatedActor };
type AdminRequest = Request & { adminActor: AdminActor };

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(IamAuthGuard, PermissionGuard)
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Get() @RequirePermission('orders.read') list(
    @Req() req: ActorRequest,
    @Query() query: OrderListQueryDto,
  ) {
    return this.orders.list(req.actor.tenantId, query);
  }
  @Post() @RequirePermission('orders.manage') create(
    @Req() req: ActorRequest,
    @Headers('idempotency-key') key: string,
    @Body() body: CreateVendorOrderDto,
  ) {
    return this.orders.createVendor(
      req.actor.tenantId,
      req.actor.actorId,
      key,
      body,
    );
  }
  @Get(':id') @RequirePermission('orders.read') detail(
    @Req() req: ActorRequest,
    @Param('id') id: string,
  ) {
    return this.orders.detail(req.actor.tenantId, id);
  }
  @Post(':id/ready') @RequirePermission('orders.manage') ready(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.orders.transition(
      req.actor.tenantId,
      req.actor.actorId,
      id,
      'ready',
      key,
    );
  }
  @Post(':id/accept') @RequirePermission('orders.manage') accept(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.orders.transition(
      req.actor.tenantId,
      req.actor.actorId,
      id,
      'accept',
      key,
    );
  }
  @Post(':id/cancel') @RequirePermission('orders.manage') cancel(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.orders.transition(
      req.actor.tenantId,
      req.actor.actorId,
      id,
      'cancel',
      key,
    );
  }
}

@ApiTags('Admin vendor payment account')
@ApiBearerAuth()
@UseGuards(AdminReviewGuard)
@RequireAdminPermission('vendor.provisioning.manage')
@Controller({ path: 'internal/admin/v1/vendors', version: VERSION_NEUTRAL })
export class InternalPaymentAccountController {
  constructor(private readonly orders: OrdersService) {}
  @Post(':vendorId/payment-account')
  paymentAccount(
    @Req() req: AdminRequest,
    @Param('vendorId') vendorId: string,
    @Headers('idempotency-key') key: string,
    @Body() body: PaymentAccountDto,
  ) {
    return this.orders.mapPaymentAccount(
      vendorId,
      req.adminActor.actorId,
      key,
      body.externalCheckoutUserId,
    );
  }
}

@ApiTags('Public ordering')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller({ path: 'public', version: '1' })
export class PublicOrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Post('vendors/:slug/orders') create(
    @Param('slug') slug: string,
    @Headers('idempotency-key') key: string,
    @Body() body: CreateCustomerOrderDto,
  ) {
    return this.orders.createCustomer(slug, key, body);
  }
  @Get('orders/:reference') status(@Param('reference') reference: string) {
    return this.orders.publicStatus(reference);
  }
}

@ApiTags('Payment webhook')
@Throttle({ default: { limit: 100, ttl: 60_000 } })
@Controller({ path: 'webhooks/payment', version: '1' })
export class PaymentWebhookController {
  constructor(private readonly orders: OrdersService) {}
  @Post() handle(
    @Headers('x-pepsa-timestamp') timestamp: string,
    @Headers('x-pepsa-signature') signature: string,
    @Headers('x-pepsa-key-id') keyId: string,
    @Body() body: PaymentWebhookDto,
  ) {
    return this.orders.paymentWebhook(timestamp, signature, keyId, body);
  }
}
