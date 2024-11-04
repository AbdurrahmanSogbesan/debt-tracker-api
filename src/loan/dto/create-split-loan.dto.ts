import {
  LoanStatus,
  Prisma,
  TransactionCategory,
  TransactionDirection,
} from '@prisma/client';

export interface UserIdMemberSplit {
  userId: number;
  amount: number;
  status?: LoanStatus;
}

export interface EmailMemberSplit {
  email: string;
  amount: number;
  status?: LoanStatus;
}

export type CreateSplitLoanRequest = Omit<
  Prisma.LoanCreateInput,
  'memberSplits'
> & {
  groupId: number;
  memberSplits: EmailMemberSplit[];
};

export type CreateSplitLoanDto = Prisma.LoanCreateInput & {
  groupId: number;
  memberSplits: UserIdMemberSplit[];
};
