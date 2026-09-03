import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  newBooking?: boolean;

  @IsOptional()
  @IsBoolean()
  cancellation?: boolean;

  @IsOptional()
  @IsBoolean()
  payment?: boolean;

  @IsOptional()
  @IsBoolean()
  dailyReport?: boolean;
}
