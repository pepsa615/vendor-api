import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ enum: ['INDIVIDUAL', 'COMPANY'] })
  @IsIn(['INDIVIDUAL', 'COMPANY'])
  vendorType: 'INDIVIDUAL' | 'COMPANY';

  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) firstName: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) lastName: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @Matches(/^\+?[0-9][0-9 -]{6,18}$/) phone: string;
  @ApiProperty({ minLength: 12, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(160) displayName: string;
}

export class VerifyEmailDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @Matches(/^\d{6}$/) code: string;
}

export class ResendCodeDto {
  @ApiProperty() @IsEmail() email: string;
}

export class LoginDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({ minLength: 12, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword: string;
}

export class CompleteInvitationDto {
  @ApiProperty({ writeOnly: true }) @IsString() @MinLength(20) token: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) firstName: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) lastName: string;
  @ApiProperty() @IsString() @Matches(/^\+?[0-9][0-9 -]{6,18}$/) phone: string;
  @ApiProperty({ minLength: 12, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;
}
