import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const NIGERIAN_STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'FCT',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
] as const;

export class PersonalDataDto {
  @ApiProperty() @IsString() @MinLength(2) firstName: string;
  @ApiProperty() @IsString() @MinLength(2) lastName: string;
  @ApiProperty({ enum: ['MALE', 'FEMALE', 'OTHER'] })
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender: string;
  @ApiProperty({ format: 'date' }) @IsDateString() dateOfBirth: string;
  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(8)
  identityNumber: string;
  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(11)
  bvn: string;
  @ApiProperty() @IsString() @MinLength(7) phone: string;
  @ApiProperty() @IsString() @MinLength(4) homeAddress: string;
  @ApiProperty({ enum: NIGERIAN_STATES }) @IsIn(NIGERIAN_STATES) state: string;
  @ApiProperty() @IsString() city: string;
}

export class BusinessDataDto {
  @ApiProperty() @IsString() @MinLength(2) legalName: string;
  @ApiProperty({
    enum: [
      'BUSINESS_NAME',
      'SOLE_PROPRIETOR',
      'LIMITED_LIABILITY',
      'UNLIMITED_LIABILITY',
      'PUBLIC_LIMITED_COMPANY',
      'NON_PROFIT',
    ],
  })
  @IsIn([
    'BUSINESS_NAME',
    'SOLE_PROPRIETOR',
    'LIMITED_LIABILITY',
    'UNLIMITED_LIABILITY',
    'PUBLIC_LIMITED_COMPANY',
    'NON_PROFIT',
  ])
  registrationType:
    | 'BUSINESS_NAME'
    | 'SOLE_PROPRIETOR'
    | 'LIMITED_LIABILITY'
    | 'UNLIMITED_LIABILITY'
    | 'PUBLIC_LIMITED_COMPANY'
    | 'NON_PROFIT';
  @ApiProperty({ format: 'date' }) @IsDateString() registrationDate: string;
  @ApiProperty() @IsString() @MinLength(2) registrationNumber: string;
  @ApiProperty() @IsString() @MinLength(2) taxNumber: string;
  @ApiProperty() @IsString() registeredAddress: string;
  @ApiProperty() @IsString() businessAddress: string;
  @ApiProperty({ enum: NIGERIAN_STATES }) @IsIn(NIGERIAN_STATES) state: string;
  @ApiProperty() @IsString() city: string;
}

export class DirectorDto extends PersonalDataDto {
  @ApiProperty() @IsString() role: string;
  @ApiProperty({ minimum: 0.01, maximum: 100 })
  @IsNumber()
  @Min(0.01)
  @Max(100)
  ownershipShare: number;
}

export class DirectorsDto {
  @ApiProperty({ type: [DirectorDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DirectorDto)
  directors: DirectorDto[];
}

export class DocumentMetadataDto {
  @ApiProperty({ enum: ['INDIVIDUAL', 'BUSINESS', 'DIRECTOR'] })
  @IsIn(['INDIVIDUAL', 'BUSINESS', 'DIRECTOR'])
  ownerType: 'INDIVIDUAL' | 'BUSINESS' | 'DIRECTOR';
  @ApiPropertyOptional() @IsOptional() @IsString() ownerId?: string;
  @ApiProperty() @IsString() documentType: string;
}
