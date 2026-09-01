import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { TIME_PATTERN } from '../../courts/time.util';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class UpdatePricingRuleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'startTime phải theo định dạng HH:mm' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'endTime phải theo định dạng HH:mm' })
  endTime?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  price?: number;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  advanceBookingHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  advancePrice?: number;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'validFrom phải theo định dạng YYYY-MM-DD' })
  validFrom?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'validTo phải theo định dạng YYYY-MM-DD' })
  validTo?: string;
}
