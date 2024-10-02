import {
  Prisma,
  TransactionCategory,
  TransactionDirection,
} from '@prisma/client';

export type LoanCreateInputExtended = Prisma.LoanCreateInput & {
  direction: TransactionDirection;
  group?: { connect: { id: number } };
  // borrowerEmail: string;
};
