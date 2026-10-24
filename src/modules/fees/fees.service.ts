import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../core/database/prisma.service.js';
import type {
  ActivateFeePolicyDto,
  AdjustFeeAssessmentDto,
  CreateFeePolicyDto,
  RetireFeePolicyDto,
  SimulateFeeDto,
} from './fees.dto.js';
import type { FeeCode, Prisma } from '../../generated/prisma/client.js';
import { PaymentService } from '../../integrations/payment/payment.service.js';

@Injectable()
export class FeesService {
  constructor(
    private readonly db: PrismaService,
    private readonly payment: PaymentService,
  ) {}

  list(scopedVendorIds?: string[]) {
    return this.db.feePolicyVersion.findMany({
      where: scopedVendorIds?.length
        ? {
            OR: [
              { scope: 'PLATFORM_DEFAULT' },
              { tenantId: { in: scopedVendorIds } },
            ],
          }
        : {},
      orderBy: [{ feeCode: 'asc' }, { scope: 'asc' }, { version: 'desc' }],
      include: { vendor: { select: { id: true, businessName: true } } },
    });
  }

  async create(actorId: string, input: CreateFeePolicyDto) {
    if (
      (input.scope === 'PLATFORM_DEFAULT' && input.tenantId) ||
      (input.scope === 'VENDOR_OVERRIDE' && !input.tenantId)
    )
      throw new BadRequestException('Fee policy scope and vendor do not match');
    if (input.calculationType === 'FLAT' && input.flatAmountMinor == null)
      throw new BadRequestException('Flat policies require flatAmountMinor');
    if (input.calculationType === 'PERCENTAGE' && input.percentageBps == null)
      throw new BadRequestException(
        'Percentage policies require percentageBps',
      );
    if (input.calculationType === 'TIERED' && !input.tiers?.length)
      throw new BadRequestException('Tiered policies require tiers');
    if (
      input.minimumAmountMinor != null &&
      input.maximumAmountMinor != null &&
      input.minimumAmountMinor > input.maximumAmountMinor
    )
      throw new BadRequestException('Minimum cannot exceed maximum');
    const latest = await this.db.feePolicyVersion.aggregate({
      where: {
        feeCode: input.feeCode,
        scope: input.scope,
        tenantId: input.tenantId ?? null,
      },
      _max: { version: true },
    });
    const version = (latest._max.version ?? 0) + 1;
    const canonical = JSON.stringify({
      ...input,
      tenantId: input.tenantId ?? null,
      version,
    });
    return this.db.feePolicyVersion.create({
      data: {
        ...input,
        tenantId: input.tenantId ?? null,
        version,
        status: 'PENDING_APPROVAL',
        createdById: actorId,
        contentHash: createHash('sha256').update(canonical).digest('hex'),
      },
    });
  }

  async activate(actorId: string, id: string, input: ActivateFeePolicyDto) {
    const policy = await this.db.feePolicyVersion.findUnique({ where: { id } });
    if (!policy) throw new NotFoundException('Fee policy not found');
    if (policy.feeCode !== 'RUNWAY_DISPATCH')
      throw new ConflictException(
        'This fee code is defined but not enabled for activation',
      );
    if (policy.createdById === actorId)
      throw new ConflictException('Fee policy requires a different approver');
    if (!['DRAFT', 'PENDING_APPROVAL', 'SCHEDULED'].includes(policy.status))
      throw new ConflictException(
        'Fee policy cannot be activated from its current state',
      );
    const effectiveFrom = new Date(input.effectiveFrom);
    const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
    if (effectiveFrom.getTime() < Date.now() - 60_000)
      throw new BadRequestException(
        'Fee policy cannot be activated retroactively',
      );
    if (effectiveTo && effectiveTo <= effectiveFrom)
      throw new BadRequestException(
        'effectiveTo must be later than effectiveFrom',
      );
    const overlap = await this.db.feePolicyVersion.findFirst({
      where: {
        id: { not: id },
        feeCode: policy.feeCode,
        scope: policy.scope,
        tenantId: policy.tenantId,
        status: { in: ['ACTIVE', 'SCHEDULED'] },
        AND: [
          {
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveFrom } }],
          },
          ...(effectiveTo ? [{ effectiveFrom: { lt: effectiveTo } }] : []),
        ],
      },
    });
    if (overlap)
      throw new ConflictException(
        'Fee policy effective interval overlaps another version',
      );
    return this.db.feePolicyVersion.update({
      where: { id },
      data: {
        status: effectiveFrom <= new Date() ? 'ACTIVE' : 'SCHEDULED',
        effectiveFrom,
        effectiveTo,
        approvedById: actorId,
        approvalReference: input.approvalReference,
        reason: input.reason,
      },
    });
  }

  async resolve(
    feeCode: FeeCode,
    tenantId: string | undefined,
    baseAmountMinor: number,
    currency = 'NGN',
    at = new Date(),
  ) {
    const common: Prisma.FeePolicyVersionWhereInput = {
      feeCode,
      currency,
      status: { in: ['ACTIVE', 'SCHEDULED'] },
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    };
    const policy =
      (tenantId
        ? await this.db.feePolicyVersion.findFirst({
            where: { ...common, scope: 'VENDOR_OVERRIDE', tenantId },
            orderBy: { version: 'desc' },
          })
        : null) ??
      (await this.db.feePolicyVersion.findFirst({
        where: { ...common, scope: 'PLATFORM_DEFAULT', tenantId: null },
        orderBy: { version: 'desc' },
      }));
    if (!policy) throw new ConflictException(`No active ${feeCode} fee policy`);
    let amountMinor = 0;
    if (policy.calculationType === 'FLAT')
      amountMinor = policy.flatAmountMinor ?? 0;
    else if (policy.calculationType === 'PERCENTAGE')
      amountMinor = this.round(
        (baseAmountMinor * (policy.percentageBps ?? 0)) / 10_000,
        policy.roundingRule,
      );
    else {
      const tiers = (policy.tiers ?? []) as Array<{
        upToMinor?: number;
        flatAmountMinor?: number;
        percentageBps?: number;
      }>;
      const tier = tiers.find(
        (candidate) =>
          candidate.upToMinor == null || baseAmountMinor <= candidate.upToMinor,
      );
      if (!tier)
        throw new ConflictException('Tiered fee policy has no matching tier');
      const raw =
        (tier.flatAmountMinor ?? 0) +
        (baseAmountMinor * (tier.percentageBps ?? 0)) / 10_000;
      amountMinor = this.round(raw, policy.roundingRule);
    }
    if (policy.minimumAmountMinor != null)
      amountMinor = Math.max(amountMinor, policy.minimumAmountMinor);
    if (policy.maximumAmountMinor != null)
      amountMinor = Math.min(amountMinor, policy.maximumAmountMinor);
    return {
      amountMinor,
      currency,
      deferralAllowed: policy.deferralAllowed,
      policy,
      snapshot: {
        policyVersionId: policy.id,
        feeCode: policy.feeCode,
        scope: policy.scope,
        version: policy.version,
        calculationType: policy.calculationType,
        roundingRule: policy.roundingRule,
        tiers: policy.tiers,
        baseAmountMinor,
        amountMinor,
        currency,
        contentHash: policy.contentHash,
      },
    };
  }

  simulate(input: SimulateFeeDto) {
    return this.resolve(
      input.feeCode,
      input.tenantId,
      input.baseAmountMinor,
      input.currency,
    );
  }

  async retire(actorId: string, id: string, input: RetireFeePolicyDto) {
    const policy = await this.db.feePolicyVersion.findUnique({ where: { id } });
    if (!policy) throw new NotFoundException('Fee policy not found');
    if (!['ACTIVE', 'SCHEDULED'].includes(policy.status))
      throw new ConflictException(
        'Only active or scheduled policies can retire',
      );
    if (policy.createdById === actorId)
      throw new ConflictException('Fee policy requires a different approver');
    return this.db.feePolicyVersion.update({
      where: { id },
      data: {
        status: 'RETIRED',
        effectiveTo: new Date(),
        approvedById: actorId,
        approvalReference: input.approvalReference,
        reason: input.reason,
      },
    });
  }

  async adjust(
    actorId: string,
    assessmentId: string,
    input: AdjustFeeAssessmentDto,
  ) {
    if (!input.amountMinor)
      throw new BadRequestException('Adjustment amount cannot be zero');
    const assessment = await this.db.feeAssessment.findUnique({
      where: { id: assessmentId },
    });
    if (!assessment) throw new NotFoundException('Fee assessment not found');
    const next = assessment.adjustedAmountMinor + input.amountMinor;
    if (assessment.assessedAmountMinor + next < 0)
      throw new BadRequestException('Adjustment exceeds assessed fee');
    let paymentReference: string | undefined;
    if (input.kind === 'COMPENSATING_CREDIT') {
      if (input.amountMinor >= 0)
        throw new BadRequestException('Compensating credits must be negative');
      const portion = await this.db.feeCollectionPortion.findFirst({
        where: {
          assessmentId,
          amountMinor: Math.abs(input.amountMinor),
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!portion)
        throw new ConflictException(
          'A compensating credit must match one collected portion',
        );
      const reversed = await this.payment.reverseCommerceDebit(
        portion.paymentTransactionId,
        input.reason,
        `fee-adjustment:${assessmentId}:${input.approvalReference}`,
      );
      paymentReference = reversed.transaction_id;
    }
    return this.db.$transaction(async (tx) => {
      const adjustment = await tx.feeAdjustment.create({
        data: {
          assessmentId,
          tenantId: assessment.tenantId,
          amountMinor: input.amountMinor,
          currency: assessment.currency,
          kind: input.kind,
          reason: input.reason,
          approvalReference: input.approvalReference,
          paymentReference,
          createdById: actorId,
        },
      });
      await tx.feeAssessment.update({
        where: { id: assessmentId },
        data: { adjustedAmountMinor: next },
      });
      return adjustment;
    });
  }

  async report(tenantId?: string) {
    const where = tenantId ? { tenantId } : {};
    const [assessed, receivables, adjustments, portions] = await Promise.all([
      this.db.feeAssessment.aggregate({
        where,
        _sum: {
          assessedAmountMinor: true,
          collectedAmountMinor: true,
          adjustedAmountMinor: true,
        },
        _count: { _all: true },
      }),
      this.db.feeReceivable.aggregate({
        where,
        _sum: { amountMinor: true, collectedMinor: true },
        _count: { _all: true },
      }),
      this.db.feeAdjustment.aggregate({
        where,
        _sum: { amountMinor: true },
        _count: { _all: true },
      }),
      this.db.feeCollectionPortion.aggregate({
        where,
        _sum: { amountMinor: true },
        _count: { _all: true },
      }),
    ]);
    return {
      source: 'vendor',
      asOf: new Date().toISOString(),
      timezone: 'Africa/Lagos',
      currency: 'NGN',
      classification: 'PROJECTED',
      assessed,
      receivables,
      adjustments,
      collectionPortions: portions,
    };
  }

  private round(value: number, rule: string) {
    if (rule === 'DOWN') return Math.floor(value);
    if (rule === 'UP') return Math.ceil(value);
    return Math.round(value);
  }
}
