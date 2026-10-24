import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AddressDto {
  @IsString() @MaxLength(240) address!: string;
  @IsString() @MaxLength(80) city!: string;
  @IsString() @MaxLength(80) state!: string;
  @IsString() @MaxLength(16) country!: 'NG';
  @IsOptional() @IsString() @MaxLength(20) postalCode?: string;
  @IsOptional() @IsString() @MaxLength(250) landmark?: string;
  @IsOptional() @IsString() @MaxLength(256) placeId?: string;
}
