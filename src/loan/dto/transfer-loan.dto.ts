import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class LoanTransferDto {
  @IsString()
  @IsOptional()
  newBorrowerEmail?: string;

  @IsString()
  @IsOptional()
  newPartyEmail?: string;
}
