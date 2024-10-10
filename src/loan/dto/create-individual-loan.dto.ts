import {
  Prisma,
  TransactionCategory,
  TransactionDirection,
} from '@prisma/client';

export type LoanCreateInput = Prisma.LoanCreateInput & {
  direction: TransactionDirection;
  groupId?: number;
  borrower: string;
};
