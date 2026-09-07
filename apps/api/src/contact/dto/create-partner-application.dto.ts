import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PartnerSportType } from '../entities/partner-application.entity';

export class CreatePartnerApplicationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  ownerFullName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  ownerPhone: string;

  @IsEmail()
  @MaxLength(254)
  ownerEmail: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  venueName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  address: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  province: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ward?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(PartnerSportType, { each: true })
  sportTypes: PartnerSportType[];

  @IsInt()
  @Min(1)
  courtCount: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
