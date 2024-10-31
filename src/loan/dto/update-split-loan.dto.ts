import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsNumber,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { UpdateIndividualLoanDto } from './update-individual-loan.dto';
import { UserIdMemberSplit } from './create-split-loan.dto';

class MemberSplitUpdateRequest {
  @IsEmail()
  email: string;

  @IsNumber()
  @Type(() => Number)
  amount: number;
}

export class UpdateSplitLoanRequest extends UpdateIndividualLoanDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MemberSplitUpdateRequest)
  memberSplits?: MemberSplitUpdateRequest[];
}

export interface UpdateSplitLoanDto extends UpdateIndividualLoanDto {
  memberSplits?: UserIdMemberSplit[];
}
