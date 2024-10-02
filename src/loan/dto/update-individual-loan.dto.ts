import {
  Prisma,
  TransactionCategory,
  TransactionDirection,
  LoanStatus,
} from '@prisma/client';

export type LoanUpdateInput = {
  amount?: number;
  description?: string;
  dueDate?: Date;
  isAcknowledged?: boolean;
  status?: LoanStatus;
  groupId?: number;
  lenderId?: number;
  borrowerId?: number;
  direction?: TransactionDirection
};
