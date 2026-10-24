import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class StopPayoutDto {
  @IsString() orderId: string;
  @IsInt() @Min(0) payoutAmountMinor: number;
}

export class DispatchPreviewDto {
  @IsIn(['OWN_FLEET', 'GENERAL_POOL']) mode: 'OWN_FLEET' | 'GENERAL_POOL';
  @IsOptional() @IsString() orderId?: string;
  @IsOptional() @IsString() batchId?: string;
  @IsOptional() @IsString() dispatcherId?: string;
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
}

export class OpenDispatchMobilityDto {
  @IsIn([
    'bicycle',
    'motorcycle',
    'tricycle',
    'car',
    'van',
    'truck',
    'large_truck',
  ])
  mobilityMethod: string;
}

export class CreateDispatchDto {
  @IsString() previewToken: string;
  @IsOptional() @IsInt() @Min(0) payoutAmountMinor?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => StopPayoutDto)
  stopPayouts?: StopPayoutDto[];
}

export class DispatchListQueryDto {
  @IsOptional() @IsIn(['active', 'history']) view: 'active' | 'history' =
    'active';
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsIn(['OWN_FLEET', 'GENERAL_POOL']) mode?: string;
  @IsOptional() @IsIn(['VENDOR_DIRECT', 'CUSTOMER_LINK']) source?: string;
  @IsOptional()
  @IsIn([
    'PENDING_MATCH',
    'PAIRED',
    'PICKED_UP',
    'DELIVERED',
    'COMPLETED',
    'CANCELLED',
  ])
  status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class ProviderLocationDto {
  @IsLatitude() latitude: number;
  @IsLongitude() longitude: number;
}

export class DispatchProviderEventDto {
  @IsString() eventId: string;
  @IsString() providerReference: string;
  @IsIn([
    'PAIRED',
    'PICKED_UP',
    'DELIVERED',
    'COMPLETED',
    'CANCELLED',
    'LOCATION',
  ])
  type: string;
  @IsDateString() occurredAt: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => ProviderLocationDto)
  location?: ProviderLocationDto;
  @IsOptional() @IsString() @MaxLength(500) message?: string;
}
