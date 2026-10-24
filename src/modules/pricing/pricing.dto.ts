import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { AddressDto } from '../../common/dto/address.dto.js';

export { AddressDto };

export class DiscountTierDto {
  @IsInt() @Min(1) @Max(4) tierNumber: number;
  @IsInt() @Min(0) minMetres: number;
  @IsInt() @Min(1) maxMetres: number;
  @IsInt() @Min(0) @Max(10_000) discountBps: number;
}

export class UpdatePricingDto {
  @IsInt() @Min(1) pricePerKmMinor: number;
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => DiscountTierDto)
  tiers: DiscountTierDto[];
}

export class CreateQuoteDto {
  @ValidateNested() @Type(() => AddressDto) pickup: AddressDto;
  @ValidateNested() @Type(() => AddressDto) delivery: AddressDto;
}
