import { IsOptional, IsString, MinLength } from 'class-validator';

export class TrackPageViewDto {
  @IsString()
  @MinLength(1)
  venueId: string;

  @IsString()
  @MinLength(1)
  path: string;

  @IsString()
  @MinLength(1)
  visitorId: string;

  @IsOptional()
  @IsString()
  referrer?: string;
}
