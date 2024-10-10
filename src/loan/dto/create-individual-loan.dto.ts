import {
  Prisma,
  TransactionCategory,
  TransactionDirection,
} from '@prisma/client';

export type LoanCreateInput = Prisma.LoanCreateInput & {
  direction: TransactionDirection;
  group?: number | { connect: { id: number } };
  borrower: string;
};
