import {
  IsDate,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LoanStatus, TransactionDirection } from '@prisma/client';
import { IsMoneyAmount } from './money-amount.decorator';

export class CreateLoanDto {
  @IsMoneyAmount()
  amount: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;

  /** From the caller's perspective: OUT = they lent, IN = they borrowed. */
  @IsEnum(TransactionDirection)
  direction: TransactionDirection;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dueDate?: Date;

  @IsOptional()
  @IsEnum(LoanStatus)
  status?: LoanStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  groupId?: number;

  @IsOptional()
  @IsEmail()
  otherPartyEmail?: string;

  // Legacy alias for otherPartyEmail, still honoured by the controller.
  @IsOptional()
  @IsEmail()
  borrower?: string;
}
