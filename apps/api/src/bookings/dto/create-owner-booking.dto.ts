import { IsString, Matches, MinLength } from 'class-validator';
import { TIME_PATTERN } from '../../courts/time.util';
import { CustomerSelectorDto } from '../../customer-contacts/dto/customer-selector.dto';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateOwnerBookingDto extends CustomerSelectorDto {
  @IsString()
  @MinLength(1)
  courtId: string;

  @Matches(DATE_PATTERN, { message: 'date phải theo định dạng YYYY-MM-DD' })
  date: string;

  @Matches(TIME_PATTERN, { message: 'startTime phải theo định dạng HH:mm' })
  startTime: string;

  @Matches(TIME_PATTERN, { message: 'endTime phải theo định dạng HH:mm' })
  endTime: string;
}
