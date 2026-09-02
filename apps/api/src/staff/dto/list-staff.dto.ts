import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StaffRole } from '../../users/entities/user.entity';

export class ListStaffDto {
  @IsOptional()
  @IsEnum(StaffRole)
  staffRole?: StaffRole;

  @IsOptional()
  @IsString()
  search?: string;
}
