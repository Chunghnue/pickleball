import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListCustomersDto {
  @IsOptional()
  @IsString()
  venueId?: string;

  @IsOptional()
  @IsIn(['all', 'new', 'regular', 'vip'])
  tier?: 'all' | 'new' | 'regular' | 'vip';

  @IsOptional()
  @IsString()
  search?: string;

  // ValidationPipe has no transform → these arrive as strings; parsed/clamped in the service.
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
