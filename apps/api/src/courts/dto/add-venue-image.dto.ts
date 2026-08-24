import { IsUrl } from 'class-validator';

export class AddVenueImageDto {
  @IsUrl()
  url: string;
}
