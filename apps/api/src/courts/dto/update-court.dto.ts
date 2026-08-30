import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { TIME_PATTERN } from '../time.util';
import { CourtStatus } from '../entities/court.entity';

export class UpdateCourtDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  pricePerHour?: number;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'openTime phải theo định dạng HH:mm' })
  openTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'closeTime phải theo định dạng HH:mm' })
  closeTime?: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(240)
  slotDurationMinutes?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsEnum(CourtStatus)
  status?: CourtStatus;
}
