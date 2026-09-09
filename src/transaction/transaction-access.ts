import { Prisma } from '@prisma/client';

// Without a group, a user sees only what they paid. Scoped to a group, they see
// the group ledger — but only as an active member, which is what was missing.
export const transactionsVisibleTo = (
  userId: number,
  groupId?: number,
): Prisma.TransactionWhereInput =>
  groupId
    ? { groupId, group: { members: { some: { userId, isDeleted: false } } } }
    : { payerId: userId };
