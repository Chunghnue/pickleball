import { IsNotEmpty, IsString } from 'class-validator';

export class CreateDisputeDto {
  @IsNotEmpty()
  @IsString()
  reason: string;
}
