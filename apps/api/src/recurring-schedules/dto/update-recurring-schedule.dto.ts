import { IsBoolean, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class UpdateRecurringScheduleDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  pricePerSession?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'validTo phải theo định dạng YYYY-MM-DD' })
  validTo?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;
}
