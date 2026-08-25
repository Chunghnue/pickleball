import { IsOptional, IsString } from 'class-validator';

export class MarkPaymentDto {
  @IsOptional()
  @IsString()
  note?: string;
}
