import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedActor } from '../../integrations/iam/authenticated-actor.js';
import { IamAuthGuard } from '../../integrations/iam/iam-auth.guard.js';
import { NotificationQueryDto } from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';
type ActorRequest = Request & { actor: AuthenticatedActor };
@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(IamAuthGuard)
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get() list(@Req() r: ActorRequest, @Query() q: NotificationQueryDto) {
    return this.notifications.list(
      r.actor.tenantId,
      r.actor.actorId,
      q.page,
      q.pageSize,
    );
  }
  @Get('unread-count') unread(@Req() r: ActorRequest) {
    return this.notifications.unread(r.actor.tenantId, r.actor.actorId);
  }
  @Patch('read-all') readAll(@Req() r: ActorRequest) {
    return this.notifications.readAll(r.actor.tenantId, r.actor.actorId);
  }
  @Patch(':id/read') read(@Req() r: ActorRequest, @Param('id') id: string) {
    return this.notifications.read(r.actor.tenantId, r.actor.actorId, id);
  }
}
