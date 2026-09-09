import { applyDecorators } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsNumber, IsPositive, Max } from 'class-validator';

// A negative amount inverts who owes whom and corrupts every downstream _sum,
// so loan and split amounts are positive-only.
export const IsMoneyAmount = () =>
  applyDecorators(
    Type(() => Number),
    IsNumber({ maxDecimalPlaces: 2 }),
    IsPositive(),
    Max(1_000_000_000),
  );
