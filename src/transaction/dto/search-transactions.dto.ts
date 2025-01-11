import { Injectable } from '@nestjs/common';
import { Prisma, Transaction } from '@prisma/client';
import { IsString, IsNumber, IsOptional, Min, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchTransactionsDto {
  @IsString()
  search: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageSize?: number;
}
