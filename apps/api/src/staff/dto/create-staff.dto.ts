import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { StaffRole } from '../../users/entities/user.entity';

export class CreateStaffDto {
  @IsString()
  @MinLength(1)
  fullName: string;

  @IsString()
  @MinLength(1)
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsEnum(StaffRole)
  staffRole: StaffRole;

  @IsString()
  @MinLength(6)
  password: string;
}
