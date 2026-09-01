import {
  IsBoolean,
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
import { CustomerSelectorDto } from '../../customer-contacts/dto/customer-selector.dto';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateRecurringScheduleDto extends CustomerSelectorDto {
  @IsString()
  @MinLength(1)
  courtId: string;

  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @Matches(TIME_PATTERN, { message: 'startTime phải theo định dạng HH:mm' })
  startTime: string;

  @Matches(TIME_PATTERN, { message: 'endTime phải theo định dạng HH:mm' })
  endTime: string;

  @IsNumber()
  @Min(0.01)
  pricePerSession: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @Matches(DATE_PATTERN, { message: 'validFrom phải theo định dạng YYYY-MM-DD' })
  validFrom: string;

  @Matches(DATE_PATTERN, { message: 'validTo phải theo định dạng YYYY-MM-DD' })
  validTo: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;
}
