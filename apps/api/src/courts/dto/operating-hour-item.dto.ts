import { IsBoolean, IsInt, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class OperatingHourItemDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @IsBoolean()
  isOpen: boolean;

  @ValidateIf((o) => o.isOpen === true)
  @IsString()
  @Matches(TIME_PATTERN, { message: 'openTime phải theo định dạng HH:mm' })
  openTime?: string | null;

  @ValidateIf((o) => o.isOpen === true)
  @IsString()
  @Matches(TIME_PATTERN, { message: 'closeTime phải theo định dạng HH:mm' })
  closeTime?: string | null;
}
