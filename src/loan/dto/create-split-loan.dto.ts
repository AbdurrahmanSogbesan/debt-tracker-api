import {
  Prisma,
  TransactionCategory,
  TransactionDirection,
} from '@prisma/client';

export interface MemberSplit {
  userId: number;
  amount: number;
}

export interface EmailMemberSplit {
  email: string;
  amount: number;
}

export type CreateSplitLoanDto = Omit<
  Prisma.LoanCreateInput,
  'memberSplits'
> & {
  groupId: number;
  memberSplits: EmailMemberSplit[];
};

export type SplitLoanInput = Prisma.LoanCreateInput & {
  groupId: number;
  memberSplits: MemberSplit[];
};