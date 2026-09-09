import { Prisma } from '@prisma/client';

// A loan is readable by either party, or by any active member of its group —
// group loans and their splits are shared context for the whole group.
export const loanVisibleTo = (userId: number): Prisma.LoanWhereInput => ({
  OR: [
    { lenderId: userId },
    { borrowerId: userId },
    { group: { members: { some: { userId, isDeleted: false } } } },
  ],
});
