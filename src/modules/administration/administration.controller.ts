import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import type { AuthenticatedActor } from '../../integrations/iam/authenticated-actor.js';
import { IamAuthGuard } from '../../integrations/iam/iam-auth.guard.js';
import { PermissionGuard } from '../../integrations/iam/permission.guard.js';
import { RequirePermission } from '../../integrations/iam/require-permission.decorator.js';
import {
  CreateRoleDto,
  InviteStaffDto,
  VendorProfileResponseDto,
  UpdateProfileDto,
  UpdateRoleDto,
} from './administration.dto.js';
import { AdministrationService } from './administration.service.js';
type ActorRequest = Request & { actor: AuthenticatedActor };

@ApiBearerAuth()
@UseGuards(IamAuthGuard, PermissionGuard)
@ApiTags('Vendor profile')
@Controller({ path: 'vendor/profile', version: '1' })
export class ProfileController {
  constructor(private readonly service: AdministrationService) {}
  @Get()
  @ApiOkResponse({ type: VendorProfileResponseDto })
  @RequirePermission('vendor.profile.read')
  get(@Req() req: ActorRequest) {
    return this.service.profile(req.actor.tenantId);
  }
  @Patch() @RequirePermission('vendor.profile.manage') update(
    @Req() req: ActorRequest,
    @Body() body: UpdateProfileDto,
  ) {
    return this.service.updateProfile(
      req.actor.tenantId,
      req.actor.actorId,
      body,
    );
  }
  @Post('logo')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  @RequirePermission('vendor.profile.manage')
  uploadLogo(
    @Req() req: ActorRequest,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.uploadLogo(req.actor.tenantId, req.actor.actorId, file);
  }
}

@ApiBearerAuth()
@UseGuards(IamAuthGuard, PermissionGuard)
@ApiTags('Roles')
@Controller({ path: 'roles', version: '1' })
export class RolesController {
  constructor(private readonly service: AdministrationService) {}
  @Get() @RequirePermission('roles.read') list(@Req() req: ActorRequest) {
    return this.service.roles(req.actor.tenantId);
  }
  @Post() @RequirePermission('roles.manage') create(
    @Req() req: ActorRequest,
    @Body() body: CreateRoleDto,
  ) {
    return this.service.createRole(req.actor.tenantId, req.actor.actorId, body);
  }
  @Put(':id') @RequirePermission('roles.manage') update(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Body() body: UpdateRoleDto,
  ) {
    return this.service.updateRole(
      req.actor.tenantId,
      req.actor.actorId,
      id,
      body,
    );
  }
  @Delete(':id') @RequirePermission('roles.manage') remove(
    @Req() req: ActorRequest,
    @Param('id') id: string,
  ) {
    return this.service.deleteRole(req.actor.tenantId, req.actor.actorId, id);
  }
}

@ApiBearerAuth()
@UseGuards(IamAuthGuard, PermissionGuard)
@ApiTags('Staff')
@Controller({ path: 'staff', version: '1' })
export class StaffController {
  constructor(private readonly service: AdministrationService) {}
  @Get() @RequirePermission('staff.read') list(@Req() req: ActorRequest) {
    return this.service.staff(req.actor.tenantId);
  }
  @Post('invitations') @RequirePermission('staff.manage') invite(
    @Req() req: ActorRequest,
    @Body() body: InviteStaffDto,
  ) {
    return this.service.invite(req.actor.tenantId, req.actor.actorId, body);
  }
  @Patch(':id/disable') @RequirePermission('staff.manage') disable(
    @Req() req: ActorRequest,
    @Param('id') id: string,
  ) {
    return this.service.disable(req.actor.tenantId, req.actor.actorId, id);
  }
}

@ApiBearerAuth()
@UseGuards(IamAuthGuard, PermissionGuard)
@ApiTags('Audit')
@Controller({ path: 'audit-events', version: '1' })
export class AuditController {
  constructor(private readonly service: AdministrationService) {}
  @Get() @RequirePermission('audit.read') list(@Req() req: ActorRequest) {
    return this.service.audits(req.actor.tenantId);
  }
}
