import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { StaffRole } from '../../users/entities/user.entity';

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(StaffRole)
  staffRole?: StaffRole;
}
