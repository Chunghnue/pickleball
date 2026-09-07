import { IsEmail, MaxLength } from 'class-validator';

export class CreateNewsletterSubscriberDto {
  @IsEmail()
  @MaxLength(254)
  email: string;
}
