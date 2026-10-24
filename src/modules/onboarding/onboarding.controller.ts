import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedActor } from '../../integrations/iam/authenticated-actor.js';
import { IamAuthGuard } from '../../integrations/iam/iam-auth.guard.js';
import {
  BusinessDataDto,
  DirectorsDto,
  DocumentMetadataDto,
  PersonalDataDto,
} from './onboarding.dto.js';
import { OnboardingService } from './onboarding.service.js';

type ActorRequest = Request & { actor: AuthenticatedActor };

@ApiTags('Onboarding')
@ApiBearerAuth()
@UseGuards(IamAuthGuard)
@Controller({ path: 'onboarding', version: '1' })
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}
  @Get('application') get(@Req() request: ActorRequest) {
    return this.onboarding.get(request.actor.tenantId);
  }
  @Put('personal') personal(
    @Req() request: ActorRequest,
    @Body() body: PersonalDataDto,
  ) {
    return this.onboarding.savePersonal(
      request.actor.tenantId,
      request.actor.actorId,
      body,
    );
  }
  @Put('business') business(
    @Req() request: ActorRequest,
    @Body() body: BusinessDataDto,
  ) {
    return this.onboarding.saveBusiness(
      request.actor.tenantId,
      request.actor.actorId,
      body,
    );
  }
  @Put('directors') directors(
    @Req() request: ActorRequest,
    @Body() body: DirectorsDto,
  ) {
    return this.onboarding.replaceDirectors(
      request.actor.tenantId,
      request.actor.actorId,
      body.directors,
    );
  }
  @Post('documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 15 * 1024 * 1024, files: 1 },
    }),
  )
  document(
    @Req() request: ActorRequest,
    @Body() body: DocumentMetadataDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new Error('Document file is required');
    return this.onboarding.upload(
      request.actor.tenantId,
      request.actor.actorId,
      body,
      file,
    );
  }
  @Post('submit') submit(@Req() request: ActorRequest) {
    return this.onboarding.submit(
      request.actor.tenantId,
      request.actor.actorId,
    );
  }
}
