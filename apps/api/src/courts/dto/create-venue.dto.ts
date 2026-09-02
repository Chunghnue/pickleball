import { IsEmail, IsNumber, IsOptional, IsString, Matches, Max, Min, MinLength, ValidateIf } from 'class-validator';
import { SLUG_PATTERN } from '../slug.util';

export class CreateVenueDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  address: string;

  @IsString()
  @MinLength(1)
  city: string;

  @IsOptional()
  @IsString()
  description?: string;

  @ValidateIf((o) => !!o.slug)
  @IsString()
  @Matches(SLUG_PATTERN, {
    message: 'Đường dẫn chỉ được chứa chữ thường, số và dấu gạch ngang',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @ValidateIf((o) => o.latitude !== undefined)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ValidateIf((o) => o.longitude !== undefined)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsEmail()
  email?: string;
}
