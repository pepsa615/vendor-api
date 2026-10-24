import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedActor } from '../../integrations/iam/authenticated-actor.js';
import { IamAuthGuard } from '../../integrations/iam/iam-auth.guard.js';
import { PermissionGuard } from '../../integrations/iam/permission.guard.js';
import { RequirePermission } from '../../integrations/iam/require-permission.decorator.js';
import { CreateQuoteDto, UpdatePricingDto } from './pricing.dto.js';
import { PricingService } from './pricing.service.js';

type ActorRequest = Request & { actor: AuthenticatedActor };

@ApiTags('Pricing')
@ApiBearerAuth()
@UseGuards(IamAuthGuard, PermissionGuard)
@Controller({ path: 'pricing', version: '1' })
export class PricingController {
  constructor(private readonly pricing: PricingService) {}
  @Get()
  @RequirePermission('payment-settings.read')
  current(@Req() req: ActorRequest) {
    return this.pricing.current(req.actor.tenantId);
  }
  @Put()
  @RequirePermission('payment-settings.manage')
  update(
    @Req() req: ActorRequest,
    @Headers('idempotency-key') key: string,
    @Body() body: UpdatePricingDto,
  ) {
    return this.pricing.update(
      req.actor.tenantId,
      req.actor.actorId,
      key,
      body,
    );
  }
  @Post('quotes')
  @RequirePermission('orders.manage')
  quote(@Req() req: ActorRequest, @Body() body: CreateQuoteDto) {
    return this.pricing.quoteForTenant(req.actor.tenantId, body);
  }
}

@ApiTags('Public ordering')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller({ path: 'public/vendors', version: '1' })
export class PublicPricingController {
  constructor(private readonly pricing: PricingService) {}
  @Get(':slug') vendor(@Param('slug') slug: string) {
    return this.pricing.publicVendor(slug);
  }
  @Post(':slug/quotes') quote(
    @Param('slug') slug: string,
    @Body() body: CreateQuoteDto,
  ) {
    return this.pricing.quote(slug, body);
  }
}
