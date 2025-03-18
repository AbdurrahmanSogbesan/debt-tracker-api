import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
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
  NotificationType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { LoanCreateInput } from './dto/create-individual-loan.dto';
import { UpdateIndividualLoanDto } from './dto/update-individual-loan.dto';
import { CreateSplitLoanDto } from './dto/create-split-loan.dto';
import { MembershipService } from 'src/membership/membership.service';
import { UpdateSplitLoanDto } from './dto/update-split-loan.dto';
import { GetChildLoansDto } from './dto/get-child-loans.dto';
import { NotificationService } from 'src/notification/notification.service';

@Injectable()
export class LoanService {
  private readonly logger = new Logger(LoanService.name);

  constructor(
    private prisma: PrismaService,
    private membershipService: MembershipService,
    private notificationService: NotificationService,
  ) {}

  async getUserByEmail(email: string): Promise<User | null> {
    if (!email) return null;
    const user = await this.prisma.user.findUnique({
      where: { email, isDeleted: false },
    });
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
    otherPartyId: number | null,
    otherPartyEmail?: string | null,
  ): Promise<Loan> {
    try {
      // Get user names outside of transaction to avoid nested queries
      const userFirstName = await this.getUserFirstName(userId);
      const otherPartyName = otherPartyId
        ? await this.getUserFirstName(otherPartyId)
        : otherPartyEmail
          ? otherPartyEmail.split('@')[0]
          : 'Guest';

      const isUserLender = data.direction === TransactionDirection.OUT;

      // Determine who's the lender and who's the borrower
      const lenderId = isUserLender ? userId : otherPartyId;
      const borrowerId = isUserLender ? otherPartyId : userId;
      const lenderEmail = lenderId
        ? null
        : isUserLender
          ? null
          : otherPartyEmail;
      const borrowerEmail = borrowerId
        ? null
        : isUserLender
          ? otherPartyEmail
          : null;

      // Validate: At least one registered user must be there
      if (!lenderId && !borrowerId) {
        throw new BadRequestException(
          'At least one party must be a registered user',
        );
      }

      // Names for the transaction title
      const lenderName = lenderId
        ? isUserLender
          ? userFirstName
          : otherPartyName
        : lenderEmail
          ? lenderEmail.split('@')[0]
          : 'Unknown';

      const borrowerName = borrowerId
        ? isUserLender
          ? otherPartyName
          : userFirstName
        : borrowerEmail
          ? borrowerEmail.split('@')[0]
          : 'Unknown';

      const loanTitle = `Loan from ${lenderName} to ${borrowerName}`;

      // Build the loan data dynamically to avoid undefined fields
      const loanData: any = {
        description: data.description,
        amount: data.amount,
        lenderEmail: lenderEmail,
        borrowerEmail: borrowerEmail,
        isAcknowledged: Boolean(lenderId && borrowerId),
        dueDate: data.dueDate,
        status: data.status || LoanStatus.ACTIVE,
        transactions: {
          create: [],
        },
      };

      // Only add relational fields if IDs exist
      if (lenderId) {
        loanData.lender = { connect: { id: lenderId } };
      }

      if (borrowerId) {
        loanData.borrower = { connect: { id: borrowerId } };
      }

      // Only link to group if both parties are registered
      if (lenderId && borrowerId && data.groupId) {
        loanData.group = { connect: { id: data.groupId } };
      }

      // Add transactions for registered users
      if (lenderId) {
        loanData.transactions.create.push(
          this.createLoanTransactionTemplate(
            data.amount,
            data.description,
            TransactionDirection.OUT,
            lenderId,
            lenderId && borrowerId ? data.groupId : undefined,
            loanTitle,
          ),
        );
      }

      if (borrowerId) {
        loanData.transactions.create.push(
          this.createLoanTransactionTemplate(
            data.amount,
            data.description,
            TransactionDirection.IN,
            borrowerId,
            lenderId && borrowerId ? data.groupId : undefined,
            loanTitle,
          ),
        );
      }

      // Create the loan within a transaction
      const loan = await this.prisma.$transaction(async (prisma) => {
        return prisma.loan.create({
          data: loanData,
          include: {
            transactions: true,
            lender: true,
            borrower: true,
          },
        });
      });

      const notificationMessage = `A new loan has been created between ${lenderName} and ${borrowerName}`;
      const notificationPayload = {
        loanId: loan.id,
        amount: loan.amount,
        lenderEmail: lenderEmail,
        borrowerEmail: borrowerEmail,
      };

      const userIdsToNotify = [
        ...(lenderId ? [lenderId] : []),
        ...(borrowerId ? [borrowerId] : []),
      ];

      if (userIdsToNotify.length > 0) {
        try {
          await this.notificationService.createNotification({
            type: NotificationType.LOAN_CREATED,
            message: notificationMessage,
            userIds: userIdsToNotify,
            payload: notificationPayload,
            loanId: loan.id,
            groupId: loan.groupId,
          });
        } catch (error) {
          this.logger.error(`Failed to create notification: ${error.message}`, {
            loanId: loan.id,
            userIds: userIdsToNotify,
          });
        }
      }

      return loan;
    } catch (error) {
      this.logger.error(`Failed to create loan: ${error.message}`, {
        userId,
        otherPartyId,
        otherPartyEmail,
        data,
        stack: error.stack,
      });

      if (error instanceof BadRequestException) {
        throw error;
      }

      if (error.code === 'P2002') {
        throw new BadRequestException('A unique constraint was violated.');
      }

      if (error.code === 'P2003') {
        throw new BadRequestException('A foreign key constraint was violated.');
      }

      throw new InternalServerErrorException(
        'Failed to create loan. Please try again later.',
      );
    }
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

    const result = await this.prisma.loan.update({
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

    if (data.status === LoanStatus.REPAID) {
      const lenderName = await this.getUserFirstName(result.lenderId);
      const borrowerName = await this.getUserFirstName(result.borrowerId);

      // Notification for lender
      await this.notificationService.createNotification({
        type: NotificationType.LOAN_REPAID,
        message: `${borrowerName} has repaid the loan of ${result.amount}`,
        userIds: [result.lenderId],
        payload: {
          loanId: result.id,
          amount: result.amount,
          status: result.status,
          perspective: 'lender',
        },
        loanId: result.id,
        groupId: result?.groupId,
      });

      // Notification for borrower
      await this.notificationService.createNotification({
        type: NotificationType.LOAN_REPAID,
        message: `You have repaid the loan of ${result.amount} to ${lenderName}`,
        userIds: [result.borrowerId],
        payload: {
          loanId: result.id,
          amount: result.amount,
          status: result.status,
          perspective: 'borrower',
        },
        loanId: result.id,
        groupId: result?.groupId,
      });
    }

    // Balance update(loan amount changes) notification
    if (loan.amount !== result.amount) {
      const amountDifference = Math.abs(loan.amount - result.amount);

      await this.notificationService.createNotification({
        type: NotificationType.BALANCE_UPDATE,
        message: `Loan amount updated from ${loan.amount} to ${result.amount}`,
        userIds: [result.lenderId, result.borrowerId],
        payload: {
          loanId: result.id,
          oldAmount: loan.amount,
          newAmount: result.amount,
          amountDifference: amountDifference,
        },
        loanId: result.id,
        groupId: result?.groupId,
      });
    }

    return result;
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
    const parentLoanId = await this.prisma.$transaction(async (prisma) => {
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

    // Create notifications after transaction
    await Promise.all(
      data.memberSplits
        .filter((split) => split.userId !== creatorId)
        .map(async (split) => {
          const childLoans = await this.prisma.loan.findMany({
            where: {
              parentId: parentLoanId,
              lenderId: creatorId,
              borrowerId: split.userId,
            },
            include: { lender: true, borrower: true },
          });

          const childLoan = childLoans[0];

          if (childLoan) {
            const borrowerName = await this.getUserFirstName(split.userId);
            const notificationMessage = `A new loan of ${split.amount} has been created between ${creatorName} and ${borrowerName}`;

            await this.notificationService.createNotification({
              type: NotificationType.LOAN_CREATED,
              message: notificationMessage,
              userIds: [creatorId, split.userId],
              payload: {
                loanId: childLoan.id,
                amount: split.amount,
                parentLoanId: parentLoanId,
              },
              loanId: childLoan.id,
              groupId: data.groupId,
            });
          }
        }),
    );

    return this.getLoanDetails(parentLoanId, 'split');
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
            description: data.description ?? existingLoan.description,
            dueDate: data.dueDate ?? existingLoan.dueDate,
            isAcknowledged: data.isAcknowledged ?? existingLoan.isAcknowledged,
            status: data.status ?? existingLoan.status,
            transactions: {
              updateMany: {
                where: { loanId: id, isDeleted: false },
                data: {
                  amount: totalAmount,
                  description: data.description ?? existingLoan.description,
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

  async getChildLoans(
    parentId: number,
    dto: GetChildLoansDto,
  ): Promise<{
    childLoans: Loan[];
    totalAmount: number;
    count: number;
  }> {
    const { searchQuery, page, pageSize } = dto;

    const userSelect = {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    };

    const filters: Prisma.LoanWhereInput = {
      parentId,
      isDeleted: false,
      ...(searchQuery
        ? {
            OR: [
              {
                borrower: {
                  firstName: { contains: searchQuery, mode: 'insensitive' },
                },
              },
              {
                borrower: {
                  lastName: { contains: searchQuery, mode: 'insensitive' },
                },
              },
              {
                borrower: {
                  email: { contains: searchQuery, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [childLoans, totalAmount, count] = await Promise.all([
      this.prisma.loan.findMany({
        where: filters,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          lender: { select: userSelect },
          borrower: { select: userSelect },
          transactions: {
            where: { isDeleted: false },
          },
        },
      }),
      this.prisma.loan
        .aggregate({
          where: filters,
          _sum: {
            amount: true,
          },
        })
        .then((res) => res._sum.amount ?? 0),
      this.prisma.loan.count({
        where: filters,
      }),
    ]);

    return {
      childLoans,
      totalAmount,
      count,
    };
  }
}
