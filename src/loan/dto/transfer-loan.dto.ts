import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class LoanTransferDto {
  @IsString()
  @IsNotEmpty()
  newBorrowerEmail: string;
}
