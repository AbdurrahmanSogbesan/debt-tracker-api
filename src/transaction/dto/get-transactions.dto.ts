import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  Min,
  IsDate,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import { TransactionCategory, TransactionDirection } from '@prisma/client';

export enum LoanFilterType {
  ALL = 'ALL', // All loans
  SPLIT_ONLY = 'SPLIT_ONLY', // Only split-related loans (parents and children)
  REGULAR = 'REGULAR', // Only regular loans (no splits)
}
export class GetTransactionsDto {
  @IsOptional()
  @IsEnum(TransactionCategory)
  category?: TransactionCategory;

  @IsOptional()
  @IsEnum(TransactionDirection)
  direction?: TransactionDirection;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  groupId?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  filterByPayer?: boolean;

  @IsOptional()
  @IsEnum(LoanFilterType)
  @Transform(({ value }) => value || LoanFilterType.ALL)
  loanFilter?: LoanFilterType = LoanFilterType.ALL;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageSize?: number = 10;
}
