import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { argon2id, argon2Verify } from 'hash-wasm';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../core/database/prisma.service.js';
import { PaymentService } from '../../integrations/payment/payment.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import {
  randomToken,
  sha256,
  verificationCode,
} from '../../common/security/crypto.js';
import type {
  CashOutDto,
  PinDto,
  ResetPinDto,
  TransferDto,
  ValidateBillerDto,
  VasDto,
  VerifyPinDto,
} from './account.dto.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  TransactionReceiptService,
  type ReceiptTransaction,
} from './transaction-receipt.service.js';

@Injectable()
export class AccountService {
  constructor(
    private readonly db: PrismaService,
    private readonly pay: PaymentService,
    private readonly audit: AuditService,
    private readonly receipts: TransactionReceiptService,
    private readonly notifications?: NotificationsService,
  ) {}
  private money(minor: number) {
    return (minor / 100).toFixed(2);
  }
  private minor(value: unknown) {
    const match = String(value ?? '').match(/^(\d+)(?:\.(\d{1,2}))?$/);
    if (!match) return 0;
    return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  }
  private async pinHash(pin: string) {
    return argon2id({
      password: pin,
      salt: randomBytes(16),
      parallelism: 1,
      iterations: 2,
      memorySize: 19_456,
      hashLength: 32,
      outputType: 'encoded',
    });
  }

  async ensureProvisioned(tenantId: string) {
    const vendor = await this.db.vendor.findUnique({ where: { id: tenantId } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (
      vendor.status !== 'APPROVED' ||
      vendor.paymentProvisioning !== 'ACTIVE' ||
      !vendor.externalCheckoutUserId ||
      !vendor.paymentWalletId ||
      !vendor.paymentSettlementId
    )
      throw new ConflictException(
        `Vendor payment account is not active (${vendor.paymentProvisioning})`,
      );
    return vendor;
  }

  async settlementSummary(tenantId: string) {
    const vendor = await this.ensureProvisioned(tenantId);
    const [settlement, debt] = await Promise.all([
      this.pay.settlementBalance(vendor.externalCheckoutUserId!),
      this.db.feeReceivable.aggregate({
        where: { tenantId, status: 'OUTSTANDING' },
        _sum: { amountMinor: true, collectedMinor: true },
      }),
    ]);
    return {
      settlement,
      outstandingFeeMinor:
        (debt._sum.amountMinor ?? 0) - (debt._sum.collectedMinor ?? 0),
      provisioning: vendor.paymentProvisioning,
    };
  }
  async wallet(tenantId: string) {
    const vendor = await this.ensureProvisioned(tenantId);
    return {
      wallet: await this.pay.getWallet(vendor.externalCheckoutUserId!),
      provisioning: vendor.paymentProvisioning,
    };
  }
  entries(tenantId: string) {
    return this.db.vendorSettlementEntry.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  withdrawals(tenantId: string) {
    return this.db.auditEvent.findMany({
      where: { tenantId, action: 'settlement.cash_out' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  fees(tenantId: string) {
    return this.db.feeReceivable.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reconcileFees(tenantId: string) {
    const vendor = await this.db.vendor.findUnique({ where: { id: tenantId } });
    if (!vendor?.externalCheckoutUserId) return { collected: 0 };
    const debts = await this.db.feeReceivable.findMany({
      where: { tenantId, status: 'OUTSTANDING' },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    let collected = 0;
    const wallet = await this.pay.getWallet(vendor.externalCheckoutUserId);
    let availableMinor = this.minor(wallet.balance ?? wallet.wallet?.balance);
    for (const debt of debts) {
      const remaining = debt.amountMinor - debt.collectedMinor;
      const amountMinor = Math.min(remaining, availableMinor);
      if (amountMinor <= 0) break;
      try {
        const payment = await this.pay.commerceDebit(
          {
            external_user_id: tenantId,
            amount: this.money(amountMinor),
            currency: debt.currency,
            narration: 'Deferred dispatch fee collection',
            reference: `fee:${debt.id}:${debt.collectedMinor}`,
            charge_code: 'RUNWAY_DISPATCH',
          },
          `fee-collection:${debt.id}:${debt.collectedMinor}`,
        );
        const newCollected = debt.collectedMinor + amountMinor;
        await this.db.$transaction(async (tx) => {
          const updated = await tx.feeReceivable.updateMany({
            where: {
              id: debt.id,
              status: 'OUTSTANDING',
              collectedMinor: debt.collectedMinor,
            },
            data: {
              collectedMinor: newCollected,
              status:
                newCollected >= debt.amountMinor ? 'COLLECTED' : 'OUTSTANDING',
              collectedAt:
                newCollected >= debt.amountMinor ? new Date() : undefined,
              paymentReference: payment.transaction_id,
            },
          });
          if (updated.count !== 1)
            throw new ConflictException('Fee collection changed concurrently');
          const assessment = await tx.feeAssessment.findFirst({
            where: {
              tenantId,
              sourceType: 'DISPATCH',
              sourceReference: debt.dispatchId,
            },
          });
          const idempotencyKey = `fee-collection:${debt.id}:${debt.collectedMinor}`;
          await tx.feeCollectionPortion.create({
            data: {
              tenantId,
              assessmentId: assessment?.id,
              receivableId: debt.id,
              sequence: debt.collectedMinor,
              amountMinor,
              currency: debt.currency,
              paymentTransactionId: payment.transaction_id,
              idempotencyKey,
            },
          });
          if (assessment)
            await tx.feeAssessment.update({
              where: { id: assessment.id },
              data: { collectedAmountMinor: { increment: amountMinor } },
            });
        });
        collected += amountMinor;
        availableMinor -= amountMinor;
      } catch {
        break;
      }
    }
    return { collected };
  }

  async pinStatus(actorId: string) {
    const user = await this.db.user.findUnique({ where: { id: actorId } });
    return {
      enrolled: Boolean(user?.transactionPinHash),
      lockedUntil: user?.pinLockedUntil ?? null,
    };
  }
  async setPin(tenantId: string, actorId: string, input: PinDto) {
    const user = await this.db.user.findFirst({
      where: { id: actorId, tenantId },
    });
    if (!user) throw new NotFoundException();
    if (user.transactionPinHash)
      throw new ConflictException('Transaction PIN is already set');
    await this.db.user.update({
      where: { id: actorId },
      data: {
        transactionPinHash: await this.pinHash(input.pin),
        pinFailedAttempts: 0,
      },
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'transaction_pin.enrolled',
    });
    return { enrolled: true };
  }
  async requestPinReset(tenantId: string, actorId: string) {
    const user = await this.db.user.findFirst({
      where: { id: actorId, tenantId },
    });
    if (!user) return { accepted: true };
    const code = verificationCode();
    await this.db.$transaction([
      this.db.authChallenge.create({
        data: {
          userId: actorId,
          type: 'TRANSACTION_PIN_RESET',
          tokenHash: sha256(`${actorId}:${code}`),
          expiresAt: new Date(Date.now() + 15 * 60_000),
        },
      }),
      this.db.emailOutbox.create({
        data: {
          recipient: user.email,
          template: 'reset-transaction-pin',
          payload: { code },
        },
      }),
    ]);
    return { accepted: true };
  }
  async resetPin(tenantId: string, actorId: string, input: ResetPinDto) {
    const challenge = await this.db.authChallenge.findFirst({
      where: {
        userId: actorId,
        type: 'TRANSACTION_PIN_RESET',
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (
      !challenge ||
      challenge.expiresAt <= new Date() ||
      challenge.tokenHash !== sha256(`${actorId}:${input.code}`)
    )
      throw new UnauthorizedException('Invalid or expired reset code');
    await this.db.$transaction([
      this.db.authChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      }),
      this.db.user.update({
        where: { id: actorId },
        data: {
          transactionPinHash: await this.pinHash(input.pin),
          pinFailedAttempts: 0,
          pinLockedUntil: null,
          tokenVersion: { increment: 1 },
        },
      }),
      this.db.session.updateMany({
        where: { userId: actorId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      tenantId,
      actorId,
      action: 'transaction_pin.reset',
    });
    return { reset: true };
  }
  async verifyPin(tenantId: string, actorId: string, input: VerifyPinDto) {
    const user = await this.db.user.findFirst({
      where: { id: actorId, tenantId },
    });
    if (
      !user?.transactionPinHash ||
      (user.pinLockedUntil && user.pinLockedUntil > new Date())
    )
      throw new UnauthorizedException('Transaction authorization failed');
    if (
      !(await argon2Verify({
        hash: user.transactionPinHash,
        password: input.pin,
      }))
    ) {
      const attempts = user.pinFailedAttempts + 1;
      await this.db.user.update({
        where: { id: actorId },
        data: {
          pinFailedAttempts: attempts,
          pinLockedUntil:
            attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null,
        },
      });
      throw new UnauthorizedException('Transaction authorization failed');
    }
    const token = randomToken();
    await this.db.$transaction([
      this.db.user.update({
        where: { id: actorId },
        data: { pinFailedAttempts: 0, pinLockedUntil: null },
      }),
      this.db.transactionPinChallenge.create({
        data: {
          userId: actorId,
          tenantId,
          tokenHash: sha256(token),
          purpose: input.purpose,
          expiresAt: new Date(Date.now() + 5 * 60_000),
        },
      }),
    ]);
    return { challengeToken: token, expiresIn: 300 };
  }
  private async consume(
    tenantId: string,
    actorId: string,
    token: string,
    purpose: string,
  ) {
    const row = await this.db.transactionPinChallenge.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (
      !row ||
      row.userId !== actorId ||
      row.tenantId !== tenantId ||
      row.purpose !== purpose ||
      row.consumedAt ||
      row.expiresAt <= new Date()
    )
      throw new UnauthorizedException('Transaction authorization failed');
    const changed = await this.db.transactionPinChallenge.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (changed.count !== 1)
      throw new UnauthorizedException('Transaction authorization failed');
  }
  async cashOut(
    tenantId: string,
    actorId: string,
    key: string,
    input: CashOutDto,
  ) {
    await this.consume(tenantId, actorId, input.challengeToken, 'CASH_OUT');
    const v = await this.ensureProvisioned(tenantId);
    const out = await this.pay.cashOut(
      {
        settlement_wallet_id: v.paymentSettlementId,
        amount: this.money(input.amountMinor),
      },
      key,
    );
    await this.audit.record({
      tenantId,
      actorId,
      action: 'settlement.cash_out',
      subjectId: out.transaction_id,
      metadata: { amountMinor: input.amountMinor },
    });
    await this.notifications?.emit({
      tenantId,
      permission: 'settlement.read',
      type: 'CASH_OUT_COMPLETED',
      title: 'Cash out processed',
      body: `A cash out of NGN ${this.money(input.amountMinor)} was processed.`,
      href: '/account?view=settlement-ledger',
      uniqueKey: `cash-out:${out.transaction_id}`,
      email: true,
    });
    return out;
  }
  banks() {
    return this.pay.banks();
  }
  enquiry(accountNumber: string, bankCode: string) {
    return this.pay.accountEnquiry({
      account_number: accountNumber,
      bank_code: bankCode,
    });
  }
  async transfer(
    tenantId: string,
    actorId: string,
    key: string,
    input: TransferDto,
  ) {
    await this.consume(tenantId, actorId, input.challengeToken, 'TRANSFER');
    const v = await this.ensureProvisioned(tenantId);
    const recipient =
      input.scope === 'internal'
        ? {
            counterparty_account_number:
              input.recipient.counterpartyAccountNumber,
          }
        : {
            destination_account_number:
              input.recipient.destinationAccountNumber,
            destination_bank_code: input.recipient.destinationBankCode,
          };
    let tx: { transaction_id: string };
    let result: unknown;
    try {
      tx = await this.pay.initiateTransfer(
        {
          wallet_id: v.paymentWalletId,
          transfer_scope: input.scope,
          amount: this.money(input.amountMinor),
          recipient,
          narration: input.narration,
        },
        `${key}:init`,
      );
      result = await this.pay.executeTransfer(
        tx.transaction_id,
        `${key}:execute`,
      );
    } catch (error) {
      try {
        await this.notifications?.emit({
          tenantId,
          permission: 'wallet.read',
          type: 'TRANSFER_FAILED',
          title: 'Transfer failed',
          body: `A transfer of NGN ${this.money(input.amountMinor)} could not be completed.`,
          href: '/account?view=wallet',
          uniqueKey: `transfer:${key}:failed`,
          email: true,
        });
      } catch {
        // Preserve the authoritative payment failure if notification delivery fails.
      }
      throw error;
    }
    await this.audit.record({
      tenantId,
      actorId,
      action: 'wallet.transfer',
      subjectId: tx.transaction_id,
      metadata: { amountMinor: input.amountMinor, scope: input.scope },
    });
    await this.notifications?.emit({
      tenantId,
      permission: 'wallet.read',
      type: 'TRANSFER_COMPLETED',
      title: 'Transfer completed',
      body: `A transfer of NGN ${this.money(input.amountMinor)} was completed.`,
      href: '/account?view=wallet',
      uniqueKey: `transfer:${tx.transaction_id}`,
      email: true,
    });
    return result;
  }
  async statement(tenantId: string, query: string) {
    const v = await this.ensureProvisioned(tenantId);
    return this.pay.transactions(v.paymentWalletId!, query);
  }
  async transaction(tenantId: string, transactionId: string) {
    const vendor = await this.ensureProvisioned(tenantId);
    const transaction = await this.pay.transaction(transactionId);
    if (transaction?.wallet_id !== vendor.paymentWalletId)
      throw new NotFoundException('Transaction not found');
    return {
      ...transaction,
      vendor_name: vendor.businessName,
      receipt_available: true,
    };
  }
  async transactionReceipt(
    tenantId: string,
    transactionId: string,
    format: 'pdf' | 'svg',
  ) {
    const transaction = await this.transaction(tenantId, transactionId);
    const amount = String(transaction.amount ?? '0.00');
    const charges = String(transaction.charges ?? '0.00');
    const stampDuty = String(transaction.stamp_duty ?? '0.00');
    const total = (
      Number(amount) +
      Number(charges) +
      Number(stampDuty)
    ).toFixed(2);
    const destination = transaction.destination as
      | { account_name?: string; account_number?: string; bank_name?: string }
      | null
      | undefined;
    const receipt: ReceiptTransaction = {
      transactionId: String(transaction.transaction_id),
      vendorName: String(transaction.vendor_name),
      status: String(transaction.status ?? 'unknown'),
      type: String(transaction.type ?? 'transaction').replaceAll('_', ' '),
      direction: String(transaction.direction ?? ''),
      amount,
      charges,
      stampDuty,
      total,
      narration: String(transaction.narration ?? '-'),
      recipient:
        [
          destination?.account_name,
          destination?.account_number,
          destination?.bank_name,
        ]
          .filter(Boolean)
          .join(' - ') ||
        String(transaction.counterparty_account_number ?? '-'),
      providerReference: String(transaction.provider_reference ?? '-'),
      createdAt: this.receiptDate(transaction.created_at),
      completedAt: this.receiptDate(transaction.executed_at),
    };
    return format === 'pdf'
      ? { body: this.receipts.pdf(receipt), type: 'application/pdf' }
      : { body: this.receipts.svg(receipt), type: 'image/svg+xml' };
  }
  private receiptDate(value: unknown) {
    if (!value) return '-';
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('en-NG', {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: 'Africa/Lagos',
    }).format(date);
  }
  vasCatalog(path: string) {
    if (!path || path.includes('..') || path.startsWith('/'))
      throw new BadRequestException();
    return this.pay.vas(path);
  }
  validateBiller(input: ValidateBillerDto) {
    return this.pay.vas('billers/validate', {
      method: 'POST',
      body: JSON.stringify({
        biller_id: input.billerId,
        beneficiary_identifier: input.beneficiaryIdentifier,
        fields: input.fields,
      }),
    });
  }
  async purchaseVas(
    tenantId: string,
    actorId: string,
    key: string,
    input: VasDto,
  ) {
    await this.consume(tenantId, actorId, input.challengeToken, 'VAS');
    const v = await this.ensureProvisioned(tenantId);
    const { challengeToken: _, ...safe } = input;
    return this.pay.vas('purchase', {
      method: 'POST',
      headers: { 'idempotency-key': key },
      body: JSON.stringify({
        wallet_id: v.paymentWalletId,
        product_type: safe.productType,
        product_provider: safe.productProvider,
        beneficiary_identifier: safe.beneficiaryIdentifier,
        amount: this.money(safe.amountMinor),
        product_id: safe.productId,
        biller_id: safe.billerId,
        validation_reference: safe.validationReference,
        customer_fields: safe.customerFields,
      }),
    });
  }
}
