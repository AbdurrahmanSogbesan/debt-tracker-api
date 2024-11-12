import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Transaction,
  Prisma,
  TransactionCategory,
  TransactionDirection,
  Loan,
  LoanStatus,
  GroupMembership,
  User,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { LoanCreateInput } from './dto/create-individual-loan.dto';
import { UpdateIndividualLoanDto } from './dto/update-individual-loan.dto';
import { CreateSplitLoanDto } from './dto/create-split-loan.dto';
import { MembershipService } from 'src/membership/membership.service';
import { UpdateSplitLoanDto } from './dto/update-split-loan.dto';

@Injectable()
export class LoanService {
  constructor(
    private prisma: PrismaService,
    private membershipService: MembershipService,
  ) {}

  async getUserByEmail(email: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user || user.isDeleted) {
      throw new NotFoundException(`User with email ${email} not found`);
    }
    return user;
  }

  async getUserIdsFromEmails(emails: string[]) {
    const users = await this.prisma.user.findMany({
      where: {
        email: {
          in: emails,
        },
        isDeleted: false,
      },
      select: {
        id: true,
        email: true,
      },
    });

    // Check if all emails were found
    const foundEmails = users.map((user) => user.email.toLowerCase());
    const missingEmails = emails.filter(
      (email) => !foundEmails.includes(email.toLowerCase()),
    );

    if (missingEmails.length > 0) {
      throw new NotFoundException(
        `Users not found for email(s): ${missingEmails.join(', ')}`,
      );
    }

    // Transform array of users into an email -> id mapping
    const emailToIdMap: Record<string, number> = {};
    for (const user of users) {
      emailToIdMap[user.email] = user.id;
    }

    return emailToIdMap;
  }

  private createLoanTransactionTemplate(
    amount: number,
    description: string,
    direction: TransactionDirection,
    payerId: number,
    groupId: number | undefined,
    title: string,
  ) {
    return {
      amount,
      description:
        direction === TransactionDirection.OUT
          ? `Loan given: ${description}`
          : `Loan received: ${description}`,
      category: TransactionCategory.LOAN,
      direction,
      date: new Date(),
      payer: { connect: { id: payerId } },
      ...(groupId && { group: { connect: { id: groupId } } }),
      title,
    };
  }

  private async getUserFirstName(id: number): Promise<string | undefined> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { firstName: true },
    });
    return user?.firstName;
  }

  async createLoan(
    data: LoanCreateInput,
    userId: number,
    otherUserId: number,
  ): Promise<Loan> {
    const [userFirstName, otherUserFirstName] = await Promise.all([
      this.getUserFirstName(userId),
      this.getUserFirstName(otherUserId),
    ]);

    const isUserLender = data.direction === TransactionDirection.OUT;
    const lenderId = isUserLender ? userId : otherUserId;
    const borrowerId = isUserLender ? otherUserId : userId;
    const lenderName = isUserLender ? userFirstName : otherUserFirstName;
    const borrowerName = isUserLender ? otherUserFirstName : userFirstName;

    const loanTitle = `Loan from ${lenderName} to ${borrowerName}`;

    return await this.prisma.loan.create({
      data: {
        description: data.description,
        amount: data.amount,
        lender: { connect: { id: lenderId } },
        borrower: { connect: { id: borrowerId } },
        isAcknowledged: false,
        dueDate: data.dueDate,
        group: data.groupId ? { connect: { id: data.groupId } } : undefined,
        status: data.status,
        transactions: {
          create: [
            this.createLoanTransactionTemplate(
              data.amount,
              data.description,
              TransactionDirection.OUT,
              lenderId,
              data.groupId,
              loanTitle,
            ),
            this.createLoanTransactionTemplate(
              data.amount,
              data.description,
              TransactionDirection.IN,
              borrowerId,
              data.groupId,
              loanTitle,
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

  async getLoanDetails(
    id: number,
    includeType: 'single' | 'split' = 'single',
  ): Promise<Loan | { parent: Loan; splits: Loan[] }> {
    const userSelect = {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    };
    const groupSelect = {
      id: true,
      name: true,
      description: true,
    };

    const baseInclude = {
      lender: { select: userSelect },
      borrower: { select: userSelect },
      group: { select: groupSelect },
      transactions: {
        where: { isDeleted: false },
      },
      splits:
        includeType === 'split'
          ? {
              where: { isDeleted: false },
              include: {
                lender: { select: userSelect },
                borrower: { select: userSelect },
              },
            }
          : undefined,
      parent:
        includeType === 'split'
          ? {
              include: {
                lender: { select: userSelect },
                borrower: { select: userSelect },
              },
            }
          : undefined,
    };

    const loan = await this.prisma.loan.findUnique({
      where: {
        id,
        isDeleted: false,
      },
      include: baseInclude,
    });

    if (!loan) {
      throw new NotFoundException(`Loan with ID ${id} not found`);
    }
    return loan;
  }

  async updateLoan(
    id: number,
    data: UpdateIndividualLoanDto,
    userId: number,
  ): Promise<Loan> {
    const loan = await this.prisma.loan.findUnique({
      where: { id, isDeleted: false, lenderId: userId },
      include: { transactions: true },
    });

    if (!loan) {
      throw new NotFoundException(`Loan with ID ${id} not found`);
    }

    return await this.prisma.loan.update({
      where: { id },
      data: {
        amount: data.amount,
        description: data.description,
        dueDate: data.dueDate,
        isAcknowledged: data.isAcknowledged,
        status: data.status,
        transactions: {
          updateMany: {
            where: { loanId: id },
            data: {
              amount: data.amount,
              description: data.description,
            },
          },
        },
      },
      include: {
        transactions: true,
        lender: true,
        borrower: true,
      },
    });
  }

  async transferLoan(
    id: number,
    newBorrowerId: number,
    userId: number,
  ): Promise<Loan> {
    const loan = await this.prisma.loan.findUnique({
      where: { id, isDeleted: false, lenderId: userId },
      include: {
        transactions: true,
        borrower: true,
        lender: true,
      },
    });

    if (!loan) {
      throw new NotFoundException(
        `Loan with ID ${id} not found or you're not the lender`,
      );
    }

    // Check if the new borrower is different from the current borrower
    if (loan.borrower.id === newBorrowerId) {
      throw new BadRequestException(
        `The loan is already assigned to this borrower`,
      );
    }

    const newBorrower = await this.prisma.user.findUnique({
      where: { id: newBorrowerId, isDeleted: false },
    });

    if (!newBorrower) {
      throw new NotFoundException(`User with ID ${newBorrowerId} not found`);
    }

    const oldBorrowerTransaction = loan.transactions.find(
      (t) => t.direction === TransactionDirection.IN,
    );
    const lenderTransaction = loan.transactions.find(
      (t) => t.direction === TransactionDirection.OUT,
    );

    if (!oldBorrowerTransaction || !lenderTransaction) {
      throw new Error('Loan transactions are incomplete or corrupted');
    }

    const newLoanTitle = `Loan from ${loan.lender.firstName} to ${newBorrower.firstName}`;

    // Sequential Transaction here to make sure if one process/query fails, the entire thing fails.
    return await this.prisma.$transaction(async (prisma) => {
      const updatedLoan = await prisma.loan.update({
        where: { id },
        data: {
          borrower: { connect: { id: newBorrowerId } },
          transactions: {
            update: {
              where: { id: lenderTransaction.id },
              data: {
                title: newLoanTitle,
                description: `Loan given: ${loan.description} (Transferred to ${newBorrower.firstName})`,
              },
            },
            ...(oldBorrowerTransaction && {
              updateMany: {
                where: { id: oldBorrowerTransaction.id },
                data: {
                  isDeleted: true,
                  description: `Loan received: ${loan.description} (Transferred Loan to ${newBorrower.firstName})`,
                },
              },
            }),
            create: this.createLoanTransactionTemplate(
              loan.amount,
              `${loan.description} (Transferred Loan from ${loan.borrower.firstName})`,
              TransactionDirection.IN,
              newBorrowerId,
              loan.groupId,
              newLoanTitle,
            ),
          },
        },
        include: {
          transactions: true,
          lender: true,
          borrower: true,
        },
      });

      return updatedLoan;
    });
  }

  async deleteLoan(id: number, userId: number) {
    const loan = await this.prisma.loan.findUnique({
      where: { id, isDeleted: false, lenderId: userId },
      include: { transactions: true },
    });

    if (!loan) {
      throw new NotFoundException(`Loan with ID ${id} not found`);
    }

    return await this.prisma.loan.update({
      where: { id },
      data: {
        isDeleted: true,
        transactions: {
          updateMany: {
            where: { loanId: id },
            data: { isDeleted: true },
          },
        },
      },
    });
  }

  async createSplitLoan(
    data: CreateSplitLoanDto,
    creatorId: number,
  ): Promise<Loan | { parent: Loan; splits: Loan[] }> {
    // Fetch group and members to validate `memberSplits`
    const group = await this.membershipService.getGroupWithMembers(
      data.groupId,
      {},
      { members: { where: { isDeleted: false } }, creator: true },
    );

    const groupMemberIds = group.members.map((member) => member.userId);
    const invalidMembers = data.memberSplits.filter(
      (split) => !groupMemberIds.includes(split.userId),
    );

    if (invalidMembers.length > 0) {
      const invalidUserIds = invalidMembers.map((m) => m.userId).join(', ');
      throw new NotFoundException(
        `The following users are not active members of this group: ${invalidUserIds}`,
      );
    }

    const totalAmount = data.memberSplits.reduce(
      (sum, split) => sum + split.amount,
      0,
    );
    const creatorName = await this.getUserFirstName(creatorId);

    // Use a transaction to create parent loan and splits together
    const result = await this.prisma.$transaction(async (prisma) => {
      const parentLoan = await prisma.loan.create({
        data: {
          amount: totalAmount,
          description: `${data.description} (Group Total)`,
          dueDate: data.dueDate,
          isAcknowledged: false,
          status: data.status ?? LoanStatus.ACTIVE,
          lender: { connect: { id: creatorId } },
          group: { connect: { id: data.groupId } },
          transactions: {
            create: this.createLoanTransactionTemplate(
              totalAmount,
              `${data.description} (Group Total)`,
              TransactionDirection.OUT,
              creatorId,
              data.groupId,
              `Loan from ${creatorName} to Group`,
            ),
          },
        },
      });
      const memberLoans = await Promise.all(
        data.memberSplits
          .filter((split) => split.userId !== creatorId)
          .map(async (split) => {
            const borrowerName = await this.getUserFirstName(split.userId);
            const loanTitle = `Loan from ${creatorName} to ${borrowerName}`;

            return prisma.loan.create({
              data: {
                amount: split.amount,
                description: data.description,
                dueDate: data.dueDate,
                isAcknowledged: false,
                status: split.status ?? LoanStatus.ACTIVE,
                lender: { connect: { id: creatorId } },
                borrower: { connect: { id: split.userId } },
                group: { connect: { id: data.groupId } },
                parent: { connect: { id: parentLoan.id } },
                transactions: {
                  create: this.createLoanTransactionTemplate(
                    split.amount,
                    data.description,
                    TransactionDirection.IN,
                    split.userId,
                    data.groupId,
                    loanTitle,
                  ),
                },
              },
            });
          }),
      );

      return parentLoan.id;
    });
    return this.getLoanDetails(result, 'split');
  }

  async updateSplitLoan(
    id: number,
    data: UpdateSplitLoanDto,
    creatorId: number,
  ): Promise<Loan> {
    // Handle non-split loan updates
    if (!data.memberSplits?.length) {
      return this.updateLoan(id, data, creatorId);
    }

    // Fetch existing loan with necessary relations in one query
    const existingLoan = await this.prisma.loan.findUnique({
      where: {
        id,
        isDeleted: false,
        lenderId: creatorId,
      },
      include: {
        group: {
          include: {
            members: {
              where: { isDeleted: false },
            },
          },
        },
        splits: {
          where: { isDeleted: false },
          include: { transactions: true },
        },
      },
    });

    if (!existingLoan) {
      throw new NotFoundException(`Loan with ID ${id} not found`);
    }

    // Validate member splits
    const validMemberIds = new Set(
      existingLoan.group.members.map((member) => member.userId),
    );

    // Validate all splits at once
    const invalidMembers = data.memberSplits.filter(
      (split) =>
        !validMemberIds.has(split.userId) || split.userId === creatorId,
    );

    if (invalidMembers.length > 0) {
      const invalidUserIds = invalidMembers.map((m) => m.userId).join(', ');
      throw new NotFoundException(
        `The following users are not valid borrowers: ${invalidUserIds}`,
      );
    }

    const totalAmount = data.memberSplits.reduce(
      (sum, split) => sum + split.amount,
      0,
    );
    const creatorName = await this.getUserFirstName(creatorId);

    const updatedParentLoanId = await this.prisma.$transaction(
      async (prisma) => {
        // 1. Update parent loan
        const updatedParentLoan = await prisma.loan.update({
          where: { id },
          data: {
            amount: totalAmount,
            description: data.description
              ? `${data.description} (Group Total)`
              : existingLoan.description,
            dueDate: data.dueDate ?? existingLoan.dueDate,
            isAcknowledged: data.isAcknowledged ?? existingLoan.isAcknowledged,
            status: data.status ?? existingLoan.status,
            transactions: {
              updateMany: {
                where: { loanId: id, isDeleted: false },
                data: {
                  amount: totalAmount,
                  description: data.description
                    ? `${data.description} (Group Total)`
                    : existingLoan.description,
                },
              },
            },
          },
        });

        // 2. Process all child loans in one go
        const existingSplitMap = new Map(
          existingLoan.splits.map((split) => [split.borrowerId, split]),
        );

        // Create/Update child loans
        await Promise.all(
          data.memberSplits.map(async (split) => {
            const existingChildLoan = existingSplitMap.get(split.userId);
            const borrowerName = await this.getUserFirstName(split.userId);
            const loanTitle = `Loan from ${creatorName} to ${borrowerName}`;

            if (existingChildLoan) {
              // Update existing child loan
              return prisma.loan.update({
                where: { id: existingChildLoan.id },
                data: {
                  amount: split.amount,
                  description: data.description ?? existingLoan.description,
                  dueDate: data.dueDate ?? existingLoan.dueDate,
                  isAcknowledged:
                    data.isAcknowledged ?? existingChildLoan.isAcknowledged,
                  status: split.status ?? existingChildLoan.status,
                  transactions: {
                    updateMany: {
                      where: { loanId: existingChildLoan.id, isDeleted: false },
                      data: {
                        amount: split.amount,
                        description:
                          data.description ?? existingLoan.description,
                      },
                    },
                  },
                },
              });
            } else {
              // Create new child loan with both transactions
              return prisma.loan.create({
                data: {
                  amount: split.amount,
                  description: data.description ?? existingLoan.description,
                  dueDate: data.dueDate ?? existingLoan.dueDate,
                  isAcknowledged: false,
                  status: split.status ?? LoanStatus.ACTIVE,
                  lenderId: creatorId,
                  borrowerId: split.userId,
                  groupId: existingLoan.groupId,
                  parentId: id,
                  transactions: {
                    create: this.createLoanTransactionTemplate(
                      split.amount,
                      data.description ?? existingLoan.description,
                      TransactionDirection.IN,
                      split.userId,
                      existingLoan.groupId,
                      loanTitle,
                    ),
                  },
                },
              });
            }
          }),
        );

        // 3. Soft delete removed splits
        const updatedUserIds = new Set(
          data.memberSplits.map((split) => split.userId),
        );
        await prisma.loan.updateMany({
          where: {
            parentId: id,
            borrowerId: { notIn: Array.from(updatedUserIds) },
            isDeleted: false,
          },
          data: { isDeleted: true },
        });
        return updatedParentLoan.id;
      },
    );
    // 4. Return updated loan with all relations
    return this.getLoanDetails(updatedParentLoanId, 'split') as Promise<Loan>;
  }

  async deleteSplitLoan(id: number, userId: number): Promise<Loan> {
    // First verify the loan exists and user has permission to delete it
    const existingLoan = await this.prisma.loan.findUnique({
      where: {
        id,
        isDeleted: false,
        lenderId: userId,
      },
      include: {
        transactions: true,
        splits: {
          where: { isDeleted: false },
          include: { transactions: true },
        },
      },
    });

    if (!existingLoan) {
      throw new NotFoundException(`Loan with ID ${id} not found`);
    }

    // Use transaction to ensure all related records are updated atomically
    return await this.prisma.$transaction(async (prisma) => {
      // Soft delete all child loans and their transactions
      if (existingLoan.splits.length > 0) {
        await prisma.loan.updateMany({
          where: {
            parentId: id,
            isDeleted: false,
          },
          data: {
            isDeleted: true,
          },
        });

        // Soft delete transactions for all child loans
        await prisma.transaction.updateMany({
          where: {
            loanId: {
              in: existingLoan.splits.map((split) => split.id),
            },
            isDeleted: false,
          },
          data: {
            isDeleted: true,
          },
        });
      }

      // Soft delete the parent loan and its transactions
      return await prisma.loan.update({
        where: { id },
        data: {
          isDeleted: true,
          transactions: {
            updateMany: {
              where: { loanId: id },
              data: { isDeleted: true },
            },
          },
        },
      });
    });
  }
}
