import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListVenuesDto {
  @IsOptional()
  @IsIn(['active', 'hidden', 'all'])
  status?: 'active' | 'hidden' | 'all';

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['default', 'name', 'newest'])
  sort?: 'default' | 'name' | 'newest';
}
