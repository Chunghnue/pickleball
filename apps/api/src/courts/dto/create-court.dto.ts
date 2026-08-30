import {
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

export class CreateCourtDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsNumber()
  @Min(0.01)
  pricePerHour: number;

  @Matches(TIME_PATTERN, { message: 'openTime phải theo định dạng HH:mm' })
  openTime: string;

  @Matches(TIME_PATTERN, { message: 'closeTime phải theo định dạng HH:mm' })
  closeTime: string;

  @IsInt()
  @Min(15)
  @Max(240)
  slotDurationMinutes: number;

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
}
