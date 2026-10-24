import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminReviewGuard, type AdminActor } from './admin-review.guard.js';
import { ReviewApplicationDto } from './admin-review.dto.js';
import { AdminReviewService } from './admin-review.service.js';
import { RequireAdminPermission } from './admin-permission.decorator.js';
type AdminRequest = Request & { adminActor: AdminActor };
@ApiTags('Admin review')
@ApiBearerAuth()
@UseGuards(AdminReviewGuard)
@RequireAdminPermission('vendor.businesses.review')
@Controller({ path: 'internal/admin/v1', version: VERSION_NEUTRAL })
export class AdminReviewController {
  constructor(private readonly service: AdminReviewService) {}
  @Get('capabilities') capabilities() {
    return {
      platform: 'vendor',
      operations: [
        {
          key: 'vendor-applications',
          method: 'GET',
          permission: 'vendor.businesses.review',
        },
        {
          key: 'vendor-application-review',
          method: 'POST',
          permission: 'vendor.businesses.review',
          idempotent: true,
        },
      ],
    };
  }
  @Get('applications') list() {
    return this.service.list();
  }
  @Get('applications/:id') detail(@Param('id') id: string) {
    return this.service.detail(id);
  }
  @Get('applications/:id/documents/:documentId') document(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.service.document(id, documentId, req.adminActor.actorId);
  }
  @Post('applications/:id/review') decide(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: ReviewApplicationDto,
  ) {
    return this.service.decide(
      id,
      req.adminActor.actorId,
      key,
      body,
      req.adminActor.requestId,
    );
  }
}
