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


async function seedUsers() {
  const defaultUsers = [
    {
      email: 'test1@example.com',
      supabaseUid: 'seed_1',
      firstName: 'Test',
      lastName: 'User1',
      phone: '+1234567890',
      isDeleted: false,
    },
    {
      email: 'test2@example.com',
      supabaseUid: 'seed_2',
      firstName: 'Test',
      lastName: 'User2',
      phone: '+1234567891',
      isDeleted: false,
    },
  ];

  console.log('Creating default users...');

  for (const user of defaultUsers) {
    try {
      await prisma.user.create({ data: user });
      console.log(`Created user: ${user.email}`);
    } catch (error) {
      console.log(`Skipping user ${user.email} - may already exist`);
    }
  }
}

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
  });
}

async function createLoan(
  lenderId: number,
  borrowerId: number,
  groupId: number | null,
  amount: number,
) {
  const loanTitle = `Loan from ${lenderId} to ${borrowerId}`;
  const description = faker.lorem.sentence();
  const dueDate = faker.date.future();

  return prisma.loan.create({
    data: {
      description,
      amount,
      lender: { connect: { id: lenderId } },
      borrower: { connect: { id: borrowerId } },
      isAcknowledged: false,
      dueDate,
      group: groupId ? { connect: { id: groupId } } : undefined,
      transactions: {
        create: [
          {
            amount,
            description: `Loan given: ${description}`,
            category: 'LOAN',
            direction: 'OUT',
            date: new Date(),
            payer: { connect: { id: lenderId } },
            group: groupId ? { connect: { id: groupId } } : undefined,
            title: loanTitle,
          },
          {
            amount,
            description: `Loan received: ${description}`,
            category: 'LOAN',
            direction: 'IN',
            date: new Date(),
            payer: { connect: { id: borrowerId } },
            group: groupId ? { connect: { id: groupId } } : undefined,
            title: loanTitle,
          },
        ],
      },
    },
  });
}

async function main() {
  const fakerRounds = 2;
  dotenv.config();
  console.log(`Seeding ${fakerRounds} rounds...`);

  // Step 1: Seed users
  await seedUsers();

  // Step 2: Get existing users
  const existingUsers = await prisma.user.findMany({
    where: { isDeleted: false },
    select: { id: true },
  });

  if (existingUsers.length < 2) {
    throw new Error(
      'Need at least 2 existing users to create groups and loans',
    );
  }

  console.log(`Found ${existingUsers.length} existing users`);

  // Step 3: Create groups and loans
  const groupPromises = Array.from({ length: fakerRounds }, async (_, i) => {
    const shuffledUsers = [...existingUsers].sort(() => Math.random() - 0.5);
    const creator = shuffledUsers[0];
    const members = shuffledUsers.slice(
      1,
      faker.datatype.number({ min: 2, max: 4 }),
    );

    console.log(`Creating group ${i + 1}/${fakerRounds}`);

    const group = await createGroup(
      creator.id,
      members.map((m) => m.id),
    );

    // Create 1-3 loans for each group
    const loanPromises = Array.from(
      { length: faker.datatype.number({ min: 1, max: 3 }) },
      async () => {
        const [lender, borrower] = faker.helpers.arrayElements(
          [creator, ...members],
          2,
        );
        return createLoan(
          lender.id,
          borrower.id,
          group.id,
          faker.datatype.number({ min: 100000, max: 500000 }),
        );
      },
    );

    await Promise.all(loanPromises);
  });

  // Step 4: Create non-group loans between random users
  const nonGroupLoanPromises = Array.from(
    { length: faker.datatype.number({ min: 3, max: 7 }) },
    async () => {
      const [lender, borrower] = faker.helpers.arrayElements(existingUsers, 2);
      return createLoan(
        lender.id,
        borrower.id,
        null,
        faker.datatype.number({ min: 50, max: 500 }),
      );
    },
  );

  // Await all promises
  await Promise.all([...groupPromises, ...nonGroupLoanPromises]);

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