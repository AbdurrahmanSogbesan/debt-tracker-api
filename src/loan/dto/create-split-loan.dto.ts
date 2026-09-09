import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LoanStatus } from '@prisma/client';
import { IsMoneyAmount } from './money-amount.decorator';

export class MemberSplitDto {
  @IsEmail()
  email: string;

  @IsMoneyAmount()
  amount: number;

  @IsOptional()
  @IsEnum(LoanStatus)
  status?: LoanStatus;
}

export class CreateSplitLoanRequest {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  groupId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dueDate?: Date;

  @IsOptional()
  @IsEnum(LoanStatus)
  status?: LoanStatus;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MemberSplitDto)
  memberSplits: MemberSplitDto[];
}

// Service-side shape: the controller resolves each email to a user id first.
export interface UserIdMemberSplit {
  userId: number;
  amount: number;
  status?: LoanStatus;
}

export interface CreateSplitLoanDto
  extends Omit<CreateSplitLoanRequest, 'memberSplits'> {
  memberSplits: UserIdMemberSplit[];
}
