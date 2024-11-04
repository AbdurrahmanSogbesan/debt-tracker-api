import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsNumber,
  ValidateNested,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { UpdateIndividualLoanDto } from './update-individual-loan.dto';
import { UserIdMemberSplit } from './create-split-loan.dto';
import { LoanStatus } from '@prisma/client';

class MemberSplitUpdateRequest {
  @IsEmail()
  email: string;

  @IsNumber()
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsEnum(LoanStatus)
  status?: LoanStatus;
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
