import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { PartnerSportType } from '../entities/partner-application.entity';

export class CreatePartnerApplicationDto {
  @IsString()
  @MinLength(1)
  ownerFullName: string;

  @IsString()
  @MinLength(1)
  ownerPhone: string;

  @IsEmail()
  ownerEmail: string;

  @IsString()
  @MinLength(1)
  venueName: string;

  @IsString()
  @MinLength(1)
  address: string;

  @IsString()
  @MinLength(1)
  province: string;

  @IsOptional()
  @IsString()
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
  website?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
