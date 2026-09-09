import { IsEmail, IsOptional } from 'class-validator';

export class LoanTransferDto {
  @IsOptional()
  @IsEmail()
  newBorrowerEmail?: string;

  @IsOptional()
  @IsEmail()
  newPartyEmail?: string;
}
