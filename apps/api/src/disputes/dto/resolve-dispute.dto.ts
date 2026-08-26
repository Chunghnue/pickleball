import { IsIn, IsOptional, IsString } from 'class-validator';

export class ResolveDisputeDto {
  @IsIn(['refund', 'reject'])
  action: 'refund' | 'reject';

  @IsOptional()
  @IsString()
  note?: string;
}
