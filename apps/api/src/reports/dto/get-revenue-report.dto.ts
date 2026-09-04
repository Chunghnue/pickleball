import { IsOptional, IsString, Matches } from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class GetRevenueReportDto {
  @IsOptional()
  @IsString()
  venueId?: string;

  @Matches(DATE_PATTERN, { message: 'from phải có định dạng YYYY-MM-DD' })
  from: string;

  @Matches(DATE_PATTERN, { message: 'to phải có định dạng YYYY-MM-DD' })
  to: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
