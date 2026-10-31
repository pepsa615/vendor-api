import { PartialType } from '@nestjs/swagger';
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
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export const engagementTypes = ['STAFF', 'FREELANCER', 'CONTRACTOR'] as const;
export const vehicleTypes = [
  'FOOT',
  'BICYCLE',
  'MOTORCYCLE',
  'TRICYCLE',
  'VAN',
  'TRUCK',
  'LONG_TRUCK',
] as const;
export const documentTypes = [
  'PROOF_OF_ID',
  'HEADSHOT',
  'PROOF_OF_ADDRESS',
  'DRIVERS_LICENSE',
  'INSURANCE',
  'ROADWORTHINESS_CERTIFICATE',
  'PROOF_OF_OWNERSHIP',
  'VEHICLE_REGISTRATION',
  'PARKING_PERMIT',
] as const;

export class CreateCustomerDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsString() @MinLength(7) @MaxLength(24) phone: string;
  @IsOptional() @IsEmail() email?: string;
}

export class PeopleListQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class CreateDispatcherDto {
  @IsString() @MinLength(2) @MaxLength(80) firstName: string;
  @IsString() @MinLength(2) @MaxLength(80) lastName: string;
  @IsEmail() email: string;
  @IsString() @MinLength(7) @MaxLength(24) phone: string;
  @IsDateString() dateOfBirth: string;
  @IsIn(['MALE', 'FEMALE', 'OTHER']) gender: string;
  @IsIn(['NIN']) identityType: 'NIN';
  @IsString() @Matches(/^\d{11}$/) identityNumber: string;
  @IsOptional() @IsDateString() identityExpiry?: string;
  @IsString() @MinLength(4) @MaxLength(240) homeAddress: string;
  @IsString() @MinLength(2) @MaxLength(80) state: string;
  @IsString() @MinLength(2) @MaxLength(80) city: string;
  @IsBoolean() termsAccepted: boolean;
  @IsIn(engagementTypes) engagementType: string;
  @IsIn(vehicleTypes) vehicleType: string;
  @IsOptional() @IsString() @MaxLength(80) vehicleBrand?: string;
  @IsOptional() @IsString() @MaxLength(32) plateNumber?: string;
  @IsDateString() vehicleRegistrationDate: string;
  @IsString() @MinLength(2) @MaxLength(120) guarantorName: string;
  @IsString() @MinLength(7) @MaxLength(24) guarantorPhone: string;
  @IsOptional() @IsEmail() guarantorEmail?: string;
  @IsString() @Matches(/^\d{11}$/) guarantorNin: string;
  @IsString() @MinLength(4) @MaxLength(240) guarantorAddress: string;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  revenueSharePct: number;
}

export class UpdateDispatcherDto extends PartialType(CreateDispatcherDto) {}

export class DispatcherDocumentDto {
  @IsIn(documentTypes) documentType: (typeof documentTypes)[number];
}

export class AvailabilityDto {
  @IsBoolean() available: boolean;
}

export class ReviewDispatcherDto {
  @IsIn(['APPROVE', 'REJECT']) decision: 'APPROVE' | 'REJECT';
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsString({ each: true }) correctionFields?: string[];
}
