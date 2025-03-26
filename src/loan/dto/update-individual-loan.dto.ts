import {
  IsOptional,
  IsNumber,
  IsString,
  IsDate,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

import {
  Prisma,
  TransactionCategory,
  TransactionDirection,
  LoanStatus,
} from '@prisma/client';

export class UpdateIndividualLoanDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  amount?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dueDate?: Date;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  isAcknowledged?: boolean;

  @IsOptional()
  @IsEnum(LoanStatus)
  status?: LoanStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  groupId?: number;
}
