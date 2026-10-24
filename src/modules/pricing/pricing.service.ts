import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../core/database/prisma.service.js';
import { MapsService } from '../../integrations/maps/maps.service.js';
import type { CreateQuoteDto, UpdatePricingDto } from './pricing.dto.js';

@Injectable()
export class PricingService {
  constructor(
    private readonly db: PrismaService,
    private readonly maps: MapsService,
    private readonly audit: AuditService,
  ) {}

  async current(tenantId: string) {
    const setting = await this.db.pricingSetting.findFirst({
      where: { tenantId, active: true },
      include: { tiers: { orderBy: { tierNumber: 'asc' } } },
      orderBy: { version: 'desc' },
    });
    return setting ?? { pricePerKmMinor: null, currency: 'NGN', tiers: [] };
  }

  validate(input: UpdatePricingDto) {
    const tiers = [...input.tiers].sort((a, b) => a.tierNumber - b.tierNumber);
    if (tiers.some((tier, index) => tier.tierNumber !== index + 1))
      throw new BadRequestException('Exactly tiers 1 through 4 are required');
    if (tiers[0].minMetres !== 0)
      throw new BadRequestException('Tier 1 must start at zero metres');
    for (let index = 0; index < tiers.length; index += 1) {
      const tier = tiers[index];
      if (tier.maxMetres <= tier.minMetres)
        throw new BadRequestException(
          'Each tier maximum must exceed its minimum',
        );
      if (index && tier.minMetres !== tiers[index - 1].maxMetres)
        throw new BadRequestException('Discount tiers must be continuous');
    }
    return tiers;
  }

  calculateAmounts(
    distanceMetres: number,
    pricePerKmMinor: number,
    discountBps: number,
  ) {
    return {
      baseAmountMinor: Math.round((distanceMetres * pricePerKmMinor) / 1000),
      finalAmountMinor: Math.round(
        (distanceMetres * pricePerKmMinor * (10_000 - discountBps)) /
          (1000 * 10_000),
      ),
    };
  }

  async update(
    tenantId: string,
    actorId: string,
    key: string,
    input: UpdatePricingDto,
  ) {
    if (!key) throw new ConflictException('Idempotency-Key is required');
    const tiers = this.validate(input);
    const scope = `pricing:${tenantId}`;
    const previous = await this.db.idempotencyRecord.findUnique({
      where: { scope_key: { scope, key } },
    });
    if (previous) return previous.responseBody;
    const response = await this.db.$transaction(async (tx) => {
      const latest = await tx.pricingSetting.findFirst({
        where: { tenantId },
        orderBy: { version: 'desc' },
      });
      await tx.pricingSetting.updateMany({
        where: { tenantId, active: true },
        data: { active: false },
      });
      const created = await tx.pricingSetting.create({
        data: {
          tenantId,
          version: (latest?.version ?? 0) + 1,
          pricePerKmMinor: input.pricePerKmMinor,
          createdById: actorId,
          tiers: { create: tiers },
        },
        include: { tiers: { orderBy: { tierNumber: 'asc' } } },
      });
      await tx.idempotencyRecord.create({
        data: {
          scope,
          key,
          actorId,
          requestHash: JSON.stringify(input),
          responseStatus: 200,
          responseBody: created as any,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      return created;
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'pricing.updated',
      subjectId: response.id,
      metadata: { version: response.version },
    });
    return response;
  }

  async publicVendor(slug: string) {
    const vendor = await this.db.vendor.findFirst({
      where: { publicSlug: slug, status: 'APPROVED' },
      select: {
        publicSlug: true,
        businessName: true,
        phone: true,
        email: true,
        tagline: true,
        description: true,
      },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async quote(slug: string, input: CreateQuoteDto) {
    const vendor = await this.db.vendor.findFirst({
      where: { publicSlug: slug, status: 'APPROVED' },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return this.quoteForTenant(vendor.id, input);
  }

  tierForDistance(
    distanceMetres: number,
    tiers: Array<{
      tierNumber: number;
      minMetres: number;
      maxMetres: number;
      discountBps: number;
    }>,
  ) {
    return tiers.find((candidate, index) =>
      index === 3
        ? distanceMetres >= candidate.minMetres &&
          distanceMetres <= candidate.maxMetres
        : distanceMetres >= candidate.minMetres &&
          distanceMetres < candidate.maxMetres,
    );
  }

  async quoteAmountForDistance(tenantId: string, distanceMetres: number) {
    const setting = await this.db.pricingSetting.findFirst({
      where: { tenantId, active: true },
      include: { tiers: { orderBy: { tierNumber: 'asc' } } },
      orderBy: { version: 'desc' },
    });
    if (!setting)
      throw new ConflictException('Vendor pricing is not configured');
    const tier = this.tierForDistance(distanceMetres, setting.tiers);
    if (!tier)
      throw new BadRequestException(
        'Route exceeds the configured delivery range',
      );
    const { baseAmountMinor, finalAmountMinor } = this.calculateAmounts(
      distanceMetres,
      setting.pricePerKmMinor,
      tier.discountBps,
    );
    return {
      amountMinor: finalAmountMinor,
      currency: setting.currency,
      baseAmountMinor,
      discountBps: tier.discountBps,
      pricePerKmMinor: setting.pricePerKmMinor,
    };
  }

  async quoteForTenant(tenantId: string, input: CreateQuoteDto) {
    const setting = await this.db.pricingSetting.findFirst({
      where: { tenantId, active: true },
      include: { tiers: { orderBy: { tierNumber: 'asc' } } },
      orderBy: { version: 'desc' },
    });
    if (!setting)
      throw new ConflictException('Vendor pricing is not configured');
    const [pickup, delivery] = await Promise.all([
      this.maps.resolveAddress(input.pickup),
      this.maps.resolveAddress(input.delivery),
    ]);
    if (
      pickup.normalizedCity !== delivery.normalizedCity ||
      pickup.normalizedState !== delivery.normalizedState
    )
      throw new BadRequestException('Only same-city delivery is supported');
    const route = await this.maps.distance(pickup, delivery);
    const tier = this.tierForDistance(route.distanceMetres, setting.tiers);
    if (!tier)
      throw new BadRequestException(
        'Route exceeds the configured delivery range',
      );
    const { baseAmountMinor, finalAmountMinor } = this.calculateAmounts(
      route.distanceMetres,
      setting.pricePerKmMinor,
      tier.discountBps,
    );
    const quote = await this.db.pricingQuote.create({
      data: {
        tenantId,
        pricingSettingId: setting.id,
        publicReference: `Q-${randomBytes(8).toString('hex').toUpperCase()}`,
        pickup: pickup as any,
        delivery: delivery as any,
        ...route,
        pricePerKmMinor: setting.pricePerKmMinor,
        discountBps: tier.discountBps,
        baseAmountMinor,
        finalAmountMinor,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    return quote;
  }
}
