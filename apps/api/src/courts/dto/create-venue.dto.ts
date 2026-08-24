import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateVenueDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  address: string;

  @IsString()
  @MinLength(1)
  city: string;

  @IsOptional()
  @IsString()
  description?: string;
}
