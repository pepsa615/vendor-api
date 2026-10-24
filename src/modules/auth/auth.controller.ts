import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthenticatedActor } from '../../integrations/iam/authenticated-actor.js';
import { IamAuthGuard } from '../../integrations/iam/iam-auth.guard.js';
import { IamTokenVerifier } from '../../integrations/iam/iam-token-verifier.js';
import {
  ChangePasswordDto,
  CompleteInvitationDto,
  LoginDto,
  RegisterDto,
  ResendCodeDto,
  VerifyEmailDto,
} from './auth.dto.js';
import { AuthService } from './auth.service.js';

type ActorRequest = Request & { actor: AuthenticatedActor };
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/v1/auth',
  maxAge: 30 * 86_400_000,
};

@ApiTags('Authentication')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: IamTokenVerifier,
  ) {}

  @Post('register') register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }
  @Post('verify-email') verify(@Body() body: VerifyEmailDto) {
    return this.auth.verifyEmail(body);
  }
  @Post('resend-code') resend(@Body() body: ResendCodeDto) {
    return this.auth.resend(body.email);
  }

  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(body);
    response.cookie('pepsa_vendor_refresh', result.refreshToken, cookieOptions);
    const { refreshToken: _, ...safe } = result;
    return safe;
  }

  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.refresh(
      request.cookies?.pepsa_vendor_refresh as string | undefined,
    );
    response.cookie('pepsa_vendor_refresh', result.refreshToken, cookieOptions);
    const { refreshToken: _, ...safe } = result;
    return safe;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(
      request.cookies?.pepsa_vendor_refresh as string | undefined,
    );
    response.clearCookie('pepsa_vendor_refresh', cookieOptions);
  }

  @Get('me')
  @UseGuards(IamAuthGuard)
  @ApiBearerAuth()
  me(@Req() request: ActorRequest) {
    return this.auth.me(request.actor.actorId);
  }

  @Post('change-password')
  @UseGuards(IamAuthGuard)
  @ApiBearerAuth()
  changePassword(
    @Req() request: ActorRequest,
    @Body() body: ChangePasswordDto,
  ) {
    return this.auth.changePassword(request.actor.actorId, body);
  }

  @Post('invitations/complete')
  complete(@Body() body: CompleteInvitationDto) {
    return this.auth.completeInvitation(body);
  }

  @Get('.well-known/jwks.json') jwks() {
    return this.tokens.jwks();
  }
}
