import {
  IsBoolean,
  IsArray,
  IsEnum,
  IsInt,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  FeeCalculationType,
  FeeCode,
  FeePolicyScope,
} from '../../generated/prisma/client.js';

export class CreateFeePolicyDto {
  @IsEnum(FeeCode) feeCode!: FeeCode;
  @IsEnum(FeePolicyScope) scope!: FeePolicyScope;
  @IsOptional() @IsUUID() tenantId?: string;
  @IsEnum(FeeCalculationType) calculationType!: FeeCalculationType;
  @IsString() @Length(3, 3) currency = 'NGN';
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) flatAmountMinor?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  percentageBps?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumAmountMinor?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maximumAmountMinor?: number;
  @IsBoolean() deferralAllowed = false;
  @IsOptional() @IsArray() tiers?: Array<{
    upToMinor?: number;
    flatAmountMinor?: number;
    percentageBps?: number;
  }>;
  @IsOptional() @IsIn(['DOWN', 'UP', 'HALF_UP']) roundingRule = 'HALF_UP';
  @IsString() @Length(3, 500) reason!: string;
}

export class RetireFeePolicyDto {
  @IsString() @Length(3, 200) approvalReference!: string;
  @IsString() @Length(3, 500) reason!: string;
}

export class AdjustFeeAssessmentDto {
  @Type(() => Number) @IsInt() amountMinor!: number;
  @IsIn(['WAIVER', 'COMPENSATING_CREDIT', 'CORRECTION']) kind!: string;
  @IsString() @Length(3, 200) approvalReference!: string;
  @IsString() @Length(3, 500) reason!: string;
}

export class ActivateFeePolicyDto {
  @IsISO8601() effectiveFrom!: string;
  @IsOptional() @IsISO8601() effectiveTo?: string;
  @IsString() @Length(3, 200) approvalReference!: string;
  @IsString() @Length(3, 500) reason!: string;
}

export class SimulateFeeDto {
  @IsEnum(FeeCode) feeCode!: FeeCode;
  @IsOptional() @IsUUID() tenantId?: string;
  @Type(() => Number) @IsInt() @Min(0) baseAmountMinor = 0;
  @IsString() @Length(3, 3) currency = 'NGN';
}
