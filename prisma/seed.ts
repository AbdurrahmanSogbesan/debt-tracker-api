import {
  PrismaClient,
  GroupRole,
  LoanStatus,
  TransactionCategory,
  TransactionDirection,
} from '@prisma/client';
import { faker } from '@faker-js/faker';
import * as dotenv from 'dotenv';

const prisma = new PrismaClient();

async function createGroup(creatorId: number, memberIds: number[]) {
  return prisma.group.create({
    data: {
      name: faker.company.name(),
      description: faker.lorem.sentence(),
      creator: {
        connect: { id: creatorId },
      },
      members: {
        createMany: {
          data: [
            { userId: creatorId, role: GroupRole.ADMIN },
            ...memberIds.map((userId) => ({
              userId,
              role: GroupRole.MEMBER,
            })),
          ],
          skipDuplicates: true,
        },
      },
    },
    include: {
      creator: true,
      members: {
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });
}

async function createLoan(
  lenderId: number,
  borrowerId: number,
  groupId: number | null,
  amount: number,
) {
  // Fetch user names
  const [lender, borrower] = await Promise.all([
    prisma.user.findUnique({
      where: { id: lenderId },
      select: { firstName: true },
    }),
    prisma.user.findUnique({
      where: { id: borrowerId },
      select: { firstName: true },
    }),
  ]);

  const loanTitle = `Loan from ${lender?.firstName} to ${borrower?.firstName}`;
  const description = faker.lorem.sentence();
  const dueDate = faker.date.future();

  // Group connection logic
  const groupConnect = groupId ? { connect: { id: groupId } } : undefined;

  // Transaction creation template
  const createTransaction = (
    direction: TransactionDirection,
    payerId: number,
    transDescription: string,
  ) => ({
    amount,
    description: transDescription,
    category: TransactionCategory.LOAN,
    direction,
    date: new Date(),
    payer: { connect: { id: payerId } },
    group: groupConnect,
    title: loanTitle,
  });

  return prisma.loan.create({
    data: {
      description,
      amount,
      lender: { connect: { id: lenderId } },
      borrower: { connect: { id: borrowerId } },
      isAcknowledged: false,
      dueDate,
      group: groupConnect,
      transactions: {
        create: [
          createTransaction(
            TransactionDirection.OUT,
            lenderId,
            `Loan given: ${description}`,
          ),
          createTransaction(
            TransactionDirection.IN,
            borrowerId,
            `Loan received: ${description}`,
          ),
        ],
      },
    },
    include: {
      transactions: true,
      lender: true,
      borrower: true,
    },
  });
}

async function main() {
  const fakerRounds = 5;
  dotenv.config();
  console.log(`Seeding ${fakerRounds} times...`);

  // Get existing users
  const existingUsers = await prisma.user.findMany({
    where: { isDeleted: false },
    select: {
      id: true,
      firstName: true,
    },
  });

  if (existingUsers.length < 2) {
    throw new Error(
      'Need at least 2 existing users to create groups and loans',
    );
  }

  console.log(`Found ${existingUsers.length} existing users`);

  // Create groups
  for (let i = 0; i < fakerRounds; i++) {
    console.log(`Creating group ${i + 1}/${fakerRounds}`);

    // Select random creator and members
    const shuffledUsers = [...existingUsers].sort(() => Math.random() - 0.5);
    const creator = shuffledUsers[0];
    const members = shuffledUsers.slice(
      1,
      faker.number.int({ min: 2, max: 4 }),
    );

    const group = await createGroup(
      creator.id,
      members.map((m) => m.id),
    );

    // Create 1-3 loans for each group
    const loanCount = faker.number.int({ min: 1, max: 3 });
    console.log(`Creating ${loanCount} loans for group ${i + 1}`);

    const groupMembers = [creator, ...members];

    for (let j = 0; j < loanCount; j++) {
      // Select random lender and borrower from group members
      const [lender, borrower] = faker.helpers.arrayElements(groupMembers, 2);

      await createLoan(
        lender.id,
        borrower.id,
        group.id,
        faker.number.float({ min: 100000, max:500000 , precision: 2 }),
      );
    }
  }

  // Create some non-group loans between random users
  const nonGroupLoanCount = faker.number.int({ min: 3, max: 7 });
  console.log(`Creating ${nonGroupLoanCount} non-group loans`);

  for (let i = 0; i < nonGroupLoanCount; i++) {
    const [lender, borrower] = faker.helpers.arrayElements(existingUsers, 2);
    await createLoan(
      lender.id,
      borrower.id,
      null,
      faker.number.float({ min: 50, max: 500, precision: 2 }),
    );
  }

  console.log('Seeding completed successfully');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
