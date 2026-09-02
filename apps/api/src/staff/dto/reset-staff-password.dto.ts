import { IsString, MinLength } from 'class-validator';

export class ResetStaffPasswordDto {
  @IsString()
  @MinLength(6)
  newPassword: string;
}
