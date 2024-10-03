import {
  Prisma,
  TransactionCategory,
  TransactionDirection,
} from '@prisma/client';

export type LoanCreateInput = Prisma.LoanCreateInput & {
  direction: TransactionDirection;
  group?: { connect: { id: number } };
  borrower: string;
};
