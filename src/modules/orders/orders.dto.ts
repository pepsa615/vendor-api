import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AddressDto } from '../../common/dto/address.dto.js';

export class ContactDto {
  @IsString() @MaxLength(120) name: string;
  @IsString() @MaxLength(24) phone: string;
  @IsOptional() @IsEmail() email?: string;
}

export class CreateVendorOrderDto {
  @ValidateNested() @Type(() => ContactDto) sender: ContactDto;
  @ValidateNested() @Type(() => ContactDto) receiver: ContactDto;
  @ValidateNested() @Type(() => AddressDto) pickup: AddressDto;
  @ValidateNested() @Type(() => AddressDto) delivery: AddressDto;
  @IsIn([
    'food_essentials',
    'pharmaceutical',
    'mail_parcel',
    'laundry_clothing',
    'electronics_gadgets',
    'large_item',
  ])
  orderType: string;
  @IsIn([
    'GENERAL',
    'FRAGILE',
    'PERISHABLE',
    'HAZARDOUS',
    'SENSITIVE',
    'OVERSIZE',
  ])
  handling: string;
  @IsNumber() @Min(0) declaredValue: number;
  @IsNumber() @Min(0.1) @Max(1000) lengthCm: number;
  @IsNumber() @Min(0.1) @Max(1000) widthCm: number;
  @IsNumber() @Min(0.1) @Max(1000) heightCm: number;
  @IsNumber() @Min(0.01) weightKg: number;
  @IsInt() @Min(1) @Max(1000) quantity: number;
  @IsIn([true]) inspectionConsent: true;
  @IsString() @MaxLength(500) itemDescription: string;
  @IsIn(['INSTANT', 'SCHEDULED']) deliveryStatus: string;
  @IsOptional() @IsDateString() scheduledStart?: string;
  @IsOptional() @IsDateString() scheduledEnd?: string;
  @IsBoolean() fragile: boolean;
  @IsOptional() @IsIn(['SMALL', 'MEDIUM', 'LARGE']) sizeEstimate?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() senderCustomerId?: string;
  @IsOptional() @IsString() receiverCustomerId?: string;
  @IsOptional() @IsBoolean() saveSender?: boolean;
  @IsOptional() @IsBoolean() saveReceiver?: boolean;
  @IsOptional()
  @IsIn([
    'bicycle',
    'motorcycle',
    'tricycle',
    'car',
    'van',
    'truck',
    'large_truck',
  ])
  mobilityMethod?: string;
  @IsOptional() @IsString() quoteReference?: string;
}

export class CreateCustomerOrderDto extends CreateVendorOrderDto {
  @IsString() declare quoteReference: string;
}

export class OrderListQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsIn(['VENDOR_DIRECT', 'CUSTOMER_LINK']) source?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class PaymentAccountDto {
  @IsString() externalCheckoutUserId: string;
}

export class PaymentWebhookDataDto {
  @IsOptional() @IsString() checkoutId?: string;
  @IsString() externalUserId!: string;
  @IsString() amount!: string;
  @IsString() currency!: string;
  @IsOptional() @IsString() paymentReference?: string;
}

export class PaymentWebhookDto {
  @IsString() eventId: string;
  @IsIn([
    'checkout.paid',
    'checkout.expired',
    'checkout.failed',
    'wallet.credited',
  ])
  eventType: string;
  @IsInt() schemaVersion: number;
  @IsString() platformId: string;
  @IsString() aggregateType: string;
  @IsString() aggregateId: string;
  @ValidateNested()
  @Type(() => PaymentWebhookDataDto)
  data!: PaymentWebhookDataDto;
}
