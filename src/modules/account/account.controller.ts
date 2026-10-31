import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { Response } from 'express';
import type { AuthenticatedActor } from '../../integrations/iam/authenticated-actor.js';
import { IamAuthGuard } from '../../integrations/iam/iam-auth.guard.js';
import { PermissionGuard } from '../../integrations/iam/permission.guard.js';
import { RequirePermission } from '../../integrations/iam/require-permission.decorator.js';
import { AccountService } from './account.service.js';
import {
  AccountEnquiryDto,
  CashOutDto,
  PinDto,
  ResetPinDto,
  TransferDto,
  ValidateBillerDto,
  VasDto,
  VerifyPinDto,
} from './account.dto.js';
type ActorRequest = Request & { actor: AuthenticatedActor };

@ApiTags('Account')
@ApiBearerAuth()
@UseGuards(IamAuthGuard, PermissionGuard)
@Controller({ path: 'account', version: '1' })
export class AccountController {
  constructor(private readonly account: AccountService) {}
  @Get('settlement-summary') @RequirePermission('settlement.read') summary(
    @Req() r: ActorRequest,
  ) {
    return this.account.settlementSummary(r.actor.tenantId);
  }
  @Get('wallet') @RequirePermission('wallet.read') wallet(
    @Req() r: ActorRequest,
  ) {
    return this.account.wallet(r.actor.tenantId);
  }
  @Get('settlements') @RequirePermission('settlement.read') entries(
    @Req() r: ActorRequest,
  ) {
    return this.account.entries(r.actor.tenantId);
  }
  @Get('withdrawals') @RequirePermission('settlement.read') withdrawals(
    @Req() r: ActorRequest,
  ) {
    return this.account.withdrawals(r.actor.tenantId);
  }
  @Get('fees') @RequirePermission('wallet.read') fees(@Req() r: ActorRequest) {
    return this.account.fees(r.actor.tenantId);
  }
  @Post('cash-out') @RequirePermission('wallet.manage') cashOut(
    @Req() r: ActorRequest,
    @Headers('idempotency-key') key: string,
    @Body() b: CashOutDto,
  ) {
    return this.account.cashOut(r.actor.tenantId, r.actor.actorId, key, b);
  }
  @Get('wallet/statement') @RequirePermission('wallet.read') statement(
    @Req() r: ActorRequest,
    @Query() q: Record<string, string>,
  ) {
    const query = new URLSearchParams(q).toString();
    return this.account.statement(r.actor.tenantId, query ? `?${query}` : '');
  }
  @Get('wallet/transactions/:transactionId')
  @RequirePermission('wallet.read')
  transaction(
    @Req() r: ActorRequest,
    @Param('transactionId') transactionId: string,
  ) {
    return this.account.transaction(r.actor.tenantId, transactionId);
  }
  @Get('wallet/transactions/:transactionId/receipt.:format')
  @RequirePermission('wallet.read')
  async receipt(
    @Req() r: ActorRequest,
    @Res() response: Response,
    @Param('transactionId') transactionId: string,
    @Param('format') format: string,
  ) {
    if (format !== 'pdf' && format !== 'svg')
      throw new BadRequestException('Receipt format must be pdf or svg');
    const receipt = await this.account.transactionReceipt(
      r.actor.tenantId,
      transactionId,
      format,
    );
    response.setHeader('Content-Type', receipt.type);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="pepsa-receipt-${transactionId}.${format}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(receipt.body);
  }
  @Get('banks') @RequirePermission('wallet.read') banks() {
    return this.account.banks();
  }
  @Post('account-enquiry') @RequirePermission('wallet.read') enquiry(
    @Body() b: AccountEnquiryDto,
  ) {
    return this.account.enquiry(b.accountNumber, b.bankCode);
  }
  @Post('transfers') @RequirePermission('wallet.manage') transfer(
    @Req() r: ActorRequest,
    @Headers('idempotency-key') key: string,
    @Body() b: TransferDto,
  ) {
    return this.account.transfer(r.actor.tenantId, r.actor.actorId, key, b);
  }
  @Get('vas/catalog') @RequirePermission('wallet.read') vasCatalog(
    @Query('path') path: string,
  ) {
    return this.account.vasCatalog(path);
  }
  @Post('vas/validate') @RequirePermission('wallet.read') validateVas(
    @Body() b: ValidateBillerDto,
  ) {
    return this.account.validateBiller(b);
  }
  @Post('vas/purchases') @RequirePermission('wallet.manage') vas(
    @Req() r: ActorRequest,
    @Headers('idempotency-key') key: string,
    @Body() b: VasDto,
  ) {
    return this.account.purchaseVas(r.actor.tenantId, r.actor.actorId, key, b);
  }
  @Get('pin') @RequirePermission('wallet.read') pinStatus(
    @Req() r: ActorRequest,
  ) {
    return this.account.pinStatus(r.actor.actorId);
  }
  @Post('pin') @RequirePermission('wallet.manage') setPin(
    @Req() r: ActorRequest,
    @Body() b: PinDto,
  ) {
    return this.account.setPin(r.actor.tenantId, r.actor.actorId, b);
  }
  @Post('pin/verify') @RequirePermission('wallet.manage') verifyPin(
    @Req() r: ActorRequest,
    @Body() b: VerifyPinDto,
  ) {
    return this.account.verifyPin(r.actor.tenantId, r.actor.actorId, b);
  }
  @Post('pin/reset/request') @RequirePermission('wallet.manage') requestReset(
    @Req() r: ActorRequest,
  ) {
    return this.account.requestPinReset(r.actor.tenantId, r.actor.actorId);
  }
  @Post('pin/reset') @RequirePermission('wallet.manage') resetPin(
    @Req() r: ActorRequest,
    @Body() b: ResetPinDto,
  ) {
    return this.account.resetPin(r.actor.tenantId, r.actor.actorId, b);
  }
}
