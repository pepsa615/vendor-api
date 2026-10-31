import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class PinDto {
  @Matches(/^\d{4,6}$/) pin: string;
}
export class VerifyPinDto extends PinDto {
  @IsIn(['CASH_OUT', 'TRANSFER', 'VAS']) purpose: string;
}
export class ResetPinDto extends PinDto {
  @Matches(/^\d{6}$/) code: string;
}
export class CashOutDto {
  @IsInt() @Min(1) amountMinor: number;
  @IsString() challengeToken: string;
}
export class AccountEnquiryDto {
  @Matches(/^\d{10,20}$/) accountNumber: string;
  @Matches(/^\d{3,10}$/) bankCode: string;
}
export class TransferRecipientDto {
  @IsOptional() @Matches(/^\d{10,20}$/) counterpartyAccountNumber?: string;
  @IsOptional() @Matches(/^\d{10,20}$/) destinationAccountNumber?: string;
  @IsOptional() @Matches(/^\d{3,10}$/) destinationBankCode?: string;
}
export class TransferDto {
  @IsIn(['internal', 'external']) scope: 'internal' | 'external';
  @IsInt() @Min(1) amountMinor: number;
  @ValidateNested()
  @Type(() => TransferRecipientDto)
  recipient: TransferRecipientDto;
  @IsOptional() @IsString() @Length(1, 140) narration?: string;
  @IsString() challengeToken: string;
}
export class VasDto {
  @IsIn(['airtime', 'data', 'electricity', 'cable_tv']) productType: string;
  @IsString() productProvider: string;
  @IsString() beneficiaryIdentifier: string;
  @IsInt() @Min(1) amountMinor: number;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() billerId?: string;
  @IsOptional() @IsString() validationReference?: string;
  @IsOptional() @IsObject() customerFields?: Record<string, string>;
  @IsString() challengeToken: string;
}
export class ValidateBillerDto {
  @IsString() billerId: string;
  @IsString() beneficiaryIdentifier: string;
  @IsInt() @Min(1) amountMinor: number;
}
