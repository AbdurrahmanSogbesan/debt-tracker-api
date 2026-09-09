import { Type } from 'class-transformer';
import { IsArray, ValidateNested, IsOptional } from 'class-validator';
import { UpdateIndividualLoanDto } from './update-individual-loan.dto';
import { MemberSplitDto, UserIdMemberSplit } from './create-split-loan.dto';

export class UpdateSplitLoanRequest extends UpdateIndividualLoanDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MemberSplitDto)
  memberSplits?: MemberSplitDto[];
}

export interface UpdateSplitLoanDto extends UpdateIndividualLoanDto {
  memberSplits?: UserIdMemberSplit[];
}
