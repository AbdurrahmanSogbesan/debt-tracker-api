import { Prisma } from '@prisma/client';

// Groups the user is an active member of. Membership is the only read grant —
// being named as creator is not enough, since creators also hold a membership.
export const groupVisibleTo = (userId: number): Prisma.GroupWhereInput => ({
  members: { some: { userId, isDeleted: false } },
});
