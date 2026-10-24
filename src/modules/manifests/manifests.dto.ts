import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class ValidateTrackingIdsDto {
  @IsString() @MaxLength(20_000) trackingIds: string;
}

export class ConfirmPreviewDto {
  @IsString() previewToken: string;
}

export class ManifestPreviewDto {
  @IsString() @MaxLength(120) name: string;
  @IsString() @MaxLength(80) originState: string;
  @IsString() @MaxLength(120) originCity: string;
  @IsString() @MaxLength(80) destinationState: string;
  @IsString() @MaxLength(120) destinationCity: string;
  @IsUUID() destinationVendorId: string;
  @IsOptional() @IsString() @MaxLength(20_000) trackingIds?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  batchIds?: string[];
}

export class ManifestListQueryDto {
  @IsOptional() @IsIn(['outbound', 'inbound']) direction = 'outbound';
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize = 20;
}

export class BatchListQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize = 20;
}

export class VendorDirectoryQueryDto {
  @IsOptional() @IsString() search = '';
}

export class ManifestActionDto {
  @IsIn(['accept', 'decline', 'request-change']) action: string;
  @IsOptional() @IsString() @MaxLength(500) message?: string;
  @IsInt() @Min(1) version: number;
}

export class ManifestTransitionDto {
  @IsIn(['IN_TRANSIT', 'REROUTED', 'REMOTE_LOCATION', 'DELIVERED'])
  status: string;
  @IsOptional() @IsString() @MaxLength(500) message?: string;
  @IsInt() @Min(1) version: number;
}
