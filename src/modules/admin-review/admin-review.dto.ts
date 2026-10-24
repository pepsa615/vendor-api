import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
export class ReviewApplicationDto {
  @IsIn(['APPROVE', 'REJECT']) decision: 'APPROVE' | 'REJECT';
  @IsString() @MinLength(3) @MaxLength(1000) reason: string;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  correctionFields?: string[];
}
