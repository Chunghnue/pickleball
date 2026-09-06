import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSupportMessageDto {
  @IsString()
  @MinLength(1)
  fullName: string;

  @IsString()
  @MinLength(1)
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(1)
  message: string;
}
