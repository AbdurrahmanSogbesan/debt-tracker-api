import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsNumber,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { UpdateIndividualLoanDto } from './update-individual-loan.dto';
import { MemberSplit } from './create-split-loan.dto';

class UpdateMemberSplitDto {
  @IsEmail()
  email: string;

  @IsNumber()
  @Type(() => Number)
  amount: number;
}

export class UpdateSplitLoanDto extends UpdateIndividualLoanDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateMemberSplitDto)
  memberSplits?: UpdateMemberSplitDto[];
}



export interface UpdateSplitLoanServiceInput extends UpdateIndividualLoanDto {
  memberSplits?: MemberSplit[];
}
