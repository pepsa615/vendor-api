import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedActor } from '../../integrations/iam/authenticated-actor.js';
import { IamAuthGuard } from '../../integrations/iam/iam-auth.guard.js';
import { PermissionGuard } from '../../integrations/iam/permission.guard.js';
import { RequirePermission } from '../../integrations/iam/require-permission.decorator.js';
import {
  AvailabilityDto,
  CreateCustomerDto,
  CreateDispatcherDto,
  DispatcherDocumentDto,
  PeopleListQueryDto,
  ReviewDispatcherDto,
  UpdateDispatcherDto,
} from './people.dto.js';
import { PeopleService } from './people.service.js';
import {
  AdminReviewGuard,
  type AdminActor,
} from '../admin-review/admin-review.guard.js';
import { RequireAdminPermission } from '../admin-review/admin-permission.decorator.js';

type ActorRequest = Request & { actor: AuthenticatedActor };
type AdminRequest = Request & { adminActor: AdminActor };

@ApiTags('Customers')
@ApiBearerAuth()
@UseGuards(IamAuthGuard, PermissionGuard)
@Controller({ path: 'people/customers', version: '1' })
export class CustomersController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  @RequirePermission('people.customers.read')
  list(@Req() req: ActorRequest, @Query() query: PeopleListQueryDto) {
    return this.people.customers(req.actor.tenantId, query);
  }

  @Post()
  @RequirePermission('people.customers.manage')
  create(@Req() req: ActorRequest, @Body() body: CreateCustomerDto) {
    return this.people.createCustomer(
      req.actor.tenantId,
      req.actor.actorId,
      body,
    );
  }
}

@ApiTags('Dispatchers')
@ApiBearerAuth()
@UseGuards(IamAuthGuard, PermissionGuard)
@Controller({ path: 'people/dispatchers', version: '1' })
export class DispatchersController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  @RequirePermission('people.dispatchers.read')
  list(@Req() req: ActorRequest, @Query() query: PeopleListQueryDto) {
    return this.people.dispatchers(req.actor.tenantId, query);
  }

  @Post()
  @RequirePermission('people.dispatchers.manage')
  create(@Req() req: ActorRequest, @Body() body: CreateDispatcherDto) {
    return this.people.createDispatcher(
      req.actor.tenantId,
      req.actor.actorId,
      body,
    );
  }

  @Get(':id')
  @RequirePermission('people.dispatchers.read')
  detail(@Req() req: ActorRequest, @Param('id') id: string) {
    return this.people.dispatcher(req.actor.tenantId, id);
  }

  @Patch(':id')
  @RequirePermission('people.dispatchers.manage')
  update(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Body() body: UpdateDispatcherDto,
  ) {
    return this.people.updateDispatcher(
      req.actor.tenantId,
      req.actor.actorId,
      id,
      body,
    );
  }

  @Post(':id/documents')
  @RequirePermission('people.dispatchers.manage')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 15 * 1024 * 1024, files: 1 },
    }),
  )
  document(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Body() body: DispatcherDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Document file is required');
    return this.people.uploadDocument(
      req.actor.tenantId,
      req.actor.actorId,
      id,
      body.documentType,
      file,
    );
  }

  @Post(':id/submit')
  @RequirePermission('people.dispatchers.manage')
  submit(@Req() req: ActorRequest, @Param('id') id: string) {
    return this.people.submit(req.actor.tenantId, req.actor.actorId, id);
  }

  @Patch(':id/availability')
  @RequirePermission('people.dispatchers.manage')
  availability(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Body() body: AvailabilityDto,
  ) {
    return this.people.availability(
      req.actor.tenantId,
      req.actor.actorId,
      id,
      body.available,
    );
  }
}

@ApiTags('Admin dispatcher review')
@ApiBearerAuth()
@UseGuards(AdminReviewGuard)
@RequireAdminPermission('vendor.dispatchers.review')
@Controller({ path: 'internal/admin/v1/dispatchers', version: VERSION_NEUTRAL })
export class InternalDispatcherReviewController {
  constructor(private readonly people: PeopleService) {}

  @Get('reviews') queue() {
    return this.people.reviewQueue();
  }

  @Get('reviews/:revisionId') detail(@Param('revisionId') revisionId: string) {
    return this.people.reviewDetail(revisionId);
  }

  @Get('reviews/:revisionId/documents/:documentId') document(
    @Req() req: AdminRequest,
    @Param('revisionId') revisionId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.people.reviewDocument(
      revisionId,
      documentId,
      req.adminActor.actorId,
    );
  }

  @Post('reviews/:revisionId') review(
    @Req() req: AdminRequest,
    @Param('revisionId') revisionId: string,
    @Headers('idempotency-key') key: string,
    @Body() body: ReviewDispatcherDto,
  ) {
    return this.people.review(
      revisionId,
      req.adminActor.actorId,
      key,
      body,
      req.adminActor.requestId,
    );
  }
}
