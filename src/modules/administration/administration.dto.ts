import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicOrderLinkDto {
  @ApiProperty({ type: () => String }) publicSlug: string;
  @ApiProperty({ type: () => String }) path: string;
  @ApiProperty({ type: () => Boolean }) enabled: boolean;
  @ApiProperty({
    type: [String],
    enum: [
      'VENDOR_NOT_APPROVED',
      'PRICING_NOT_CONFIGURED',
      'PAYMENT_NOT_READY',
    ],
  })
  blockers: string[];
}

export class VendorProfileResponseDto {
  @ApiProperty({ type: () => String }) id: string;
  @ApiProperty({ type: () => String, enum: ['INDIVIDUAL', 'COMPANY'] })
  type: string;
  @ApiProperty({ type: () => String }) status: string;
  @ApiProperty({ type: () => String }) businessName: string;
  @ApiProperty({ type: () => String }) email: string;
  @ApiProperty({ type: () => String }) phone: string;
  @ApiPropertyOptional({ nullable: true, type: () => String })
  tagline: string | null;
  @ApiPropertyOptional({ nullable: true, type: () => String })
  description: string | null;
  @ApiPropertyOptional({ nullable: true, type: () => String })
  logoUrl: string | null;
  @ApiPropertyOptional({
    nullable: true,
    type: 'object',
    additionalProperties: true,
  })
  rejectionNotes: unknown;
  @ApiProperty({ type: () => PublicOrderLinkDto })
  publicOrder: PublicOrderLinkDto;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) businessName?: string;
  @IsOptional() @IsString() @MinLength(7) @MaxLength(24) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(36) tagline?: string;
  @IsOptional() @IsString() @MaxLength(96) description?: string;
}
export class CreateRoleDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(240) description?: string;
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  permissions: string[];
}
export class UpdateRoleDto extends CreateRoleDto {}
export class InviteStaffDto {
  @IsEmail() email: string;
  @IsString() roleId: string;
}
