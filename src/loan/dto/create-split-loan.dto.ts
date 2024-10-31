import {
  Prisma,
  TransactionCategory,
  TransactionDirection,
} from '@prisma/client';

export interface UserIdMemberSplit {
  userId: number;
  amount: number;
}

export interface EmailMemberSplit {
  email: string;
  amount: number;
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
