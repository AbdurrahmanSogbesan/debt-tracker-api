import {
  BadRequestException,
  ForbiddenException,
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
import { addDays, differenceInDays, endOfDay, startOfDay } from 'date-fns';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class LoanService {
  private readonly logger = new Logger(LoanService.name);

  constructor(
    private prisma: PrismaService,
    private membershipService: MembershipService,
    private notificationService: NotificationService,
  ) {}

  private generateReminderMessage(
    daysUntilDue: number,
    amount: number,
  ): string {
    if (daysUntilDue === 0) {
      return `Loan payment of $${amount.toFixed(2)} is due today!`;
    }
    return `Reminder: Loan payment of $${amount.toFixed(2)} is due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}.`;
  }

  private generateOverdueMessage(daysOverdue: number, amount: number): string {
    return `OVERDUE ALERT: Loan payment of $${amount.toFixed(2)} is ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} past due.`;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleLoanReminders() {
    try {
      const upcomingLoans = await this.prisma.loan.findMany({
        where: {
          status: LoanStatus.ACTIVE,
          isDeleted: false,
          dueDate: {
            gte: startOfDay(new Date()),
            lte: endOfDay(addDays(new Date(), 3)),
          },
        },
        include: {
          borrower: true,
          lender: true,
        },
      });

      for (const loan of upcomingLoans) {
        const daysUntilDue = differenceInDays(loan.dueDate, new Date());

        await this.notificationService.createNotification({
          type: 'LOAN_REMINDER',
          message: this.generateReminderMessage(daysUntilDue, loan.amount),
          userIds: [loan.borrowerId, loan.lenderId].filter(Boolean),
          loanId: loan.id,
          payload: { loanId: loan.id, amount: loan.amount },
        });
      }

      this.logger.log(`Processed ${upcomingLoans.length} loan reminders`);
    } catch (error) {
      this.logger.error('Error in loan reminders cron job:', error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleOverdueLoans() {
    try {
      // Find overdue loans
      const overdueLoans = await this.prisma.loan.findMany({
        where: {
          status: LoanStatus.ACTIVE,
          isDeleted: false,
          dueDate: {
            lt: startOfDay(new Date()),
          },
        },
        include: {
          borrower: true,
          lender: true,
        },
      });

      for (const loan of overdueLoans) {
        const daysOverdue = differenceInDays(new Date(), loan.dueDate);

        await this.notificationService.createNotification({
          type: NotificationType.OVERDUE_ALERT,
          message: this.generateOverdueMessage(daysOverdue, loan.amount),
          userIds: [loan.borrowerId, loan.lenderId].filter(Boolean),
          loanId: loan.id,
          payload: { loanId: loan.id, amount: loan.amount },
        });
        console.log(
          'user ids --->>',
          [loan.borrowerId, loan.lenderId].filter(Boolean),
        );
      }

      this.logger.log(`Processed ${overdueLoans.length} overdue loans`);
    } catch (error) {
      this.logger.error('Error in overdue loans cron job:', error);
    }
  }

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
    try {
      const loan = await this.prisma.loan.findUnique({
        where: { id, isDeleted: false },
        include: {
          transactions: true,
          lender: true,
          borrower: true,
        },
      });

      if (!loan) {
        throw new NotFoundException(`Loan with ID ${id} not found`);
      }

      if (loan.lenderId !== userId && loan.borrowerId !== userId) {
        throw new ForbiddenException(
          'You are not authorized to update this loan',
        );
      }

      const isUserLender = loan.lenderId === userId;
      const isUserBorrower = loan.borrowerId === userId;

      const lenderName = loan.lender?.id
        ? await this.getUserFirstName(loan.lender.id)
        : loan.lenderEmail?.split('@')[0] || 'Unknown';

      const borrowerName = loan.borrower?.id
        ? await this.getUserFirstName(loan.borrower.id)
        : loan.borrowerEmail?.split('@')[0] || 'Unknown';

      const updateData: any = {};

      if (data.amount !== undefined) updateData.amount = data.amount;
      if (data.description !== undefined)
        updateData.description = data.description;
      if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;

      // Only the registered user can acknowledge the loan
      // If the loan involves a non-registered user, the acknowledgement logic must be handled carefully
      if (data.isAcknowledged !== undefined) {
        // For a loan where both parties are registered, either can acknowledge
        if (loan.lenderId && loan.borrowerId) {
          updateData.isAcknowledged = data.isAcknowledged;
        }
        // For a loan with a non-registered party, only the registered user can set acknowledgement
        else if (
          (isUserLender && !loan.borrowerId) ||
          (isUserBorrower && !loan.lenderId)
        ) {
          updateData.isAcknowledged = data.isAcknowledged;
        }
      }

      if (data.status !== undefined) updateData.status = data.status;

      // Update group if provided and both parties are registered users
      if (data.groupId !== undefined && loan.lenderId && loan.borrowerId) {
        updateData.group = { connect: { id: data.groupId } };
        updateData.groupId = data.groupId;
      }

      // Only update transaction fields that are being changed in the loan
      const transactionUpdateData: any = {};
      if (data.amount !== undefined) transactionUpdateData.amount = data.amount;
      if (data.description !== undefined)
        transactionUpdateData.description = data.description;

      if (
        Object.keys(transactionUpdateData).length > 0 &&
        loan.transactions.length > 0
      ) {
        updateData.transactions = {
          updateMany: {
            where: { loanId: id },
            data: transactionUpdateData,
          },
        };
      }

      // Create the loan within a transaction
      const result = await this.prisma.$transaction(async (tx) => {
        return tx.loan.update({
          where: { id },
          data: updateData,
          include: {
            transactions: true,
            lender: true,
            borrower: true,
          },
        });
      });

      // Notifications block - only notify registered users
      const userIdsToNotify = [
        ...(result.lenderId ? [result.lenderId] : []),
        ...(result.borrowerId ? [result.borrowerId] : []),
      ].filter((id) => id !== null);

      if (data.status !== undefined && data.status !== loan.status) {
        if (data.status === LoanStatus.REPAID) {
          if (result.lenderId) {
            try {
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
                groupId: result.groupId,
              });
            } catch (error) {
              this.logger.error(
                `Failed to create lender notification: ${error.message}`,
                {
                  loanId: result.id,
                  lenderId: result.lenderId,
                },
              );
            }
          }

          // Notification for borrower (only if registered)
          if (result.borrowerId) {
            try {
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
                groupId: result.groupId,
              });
            } catch (error) {
              this.logger.error(
                `Failed to create borrower notification: ${error.message}`,
                {
                  loanId: result.id,
                  borrowerId: result.borrowerId,
                },
              );
            }
          }
        } else {
          // Generic status change notification
          if (userIdsToNotify.length > 0) {
            try {
              await this.notificationService.createNotification({
                type: NotificationType.LOAN_REPAID,
                message: `Loan status updated from ${loan.status} to ${result.status}`,
                userIds: userIdsToNotify,
                payload: {
                  loanId: result.id,
                  oldStatus: loan.status,
                  newStatus: result.status,
                },
                loanId: result.id,
                groupId: result.groupId,
              });
            } catch (error) {
              this.logger.error(
                `Failed to create status notification: ${error.message}`,
                {
                  loanId: result.id,
                  userIds: userIdsToNotify,
                },
              );
            }
          }
        }
      }

      // Amount change notification (only for registered users)
      if (data.amount !== undefined && loan.amount !== data.amount) {
        if (userIdsToNotify.length > 0) {
          try {
            await this.notificationService.createNotification({
              type: NotificationType.BALANCE_UPDATE,
              message: `Loan amount updated from ${loan.amount} to ${result.amount}`,
              userIds: userIdsToNotify,
              payload: {
                loanId: result.id,
                oldAmount: loan.amount,
                newAmount: result.amount,
                amountDifference: Math.abs(loan.amount - result.amount),
              },
              loanId: result.id,
              groupId: result.groupId,
            });
          } catch (error) {
            this.logger.error(
              `Failed to create amount update notification: ${error.message}`,
              {
                loanId: result.id,
                userIds: userIdsToNotify,
              },
            );
          }
        }
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to update loan: ${error.message}`, {
        loanId: id,
        userId,
        data,
        stack: error.stack,
      });

      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      if (error.code === 'P2002') {
        throw new BadRequestException('A unique constraint was violated.');
      }

      if (error.code === 'P2003') {
        throw new BadRequestException('A foreign key constraint was violated.');
      }

      throw new InternalServerErrorException(
        'Failed to update loan. Please try again later.',
      );
    }
  }

  async transferLoan(
    id: number,
    userId: number,
    newBorrowerId?: number,
    newPartyEmail?: string,
  ): Promise<Loan> {
    const loan = await this.prisma.loan.findUnique({
      where: { id, isDeleted: false },
      include: {
        transactions: true,
        borrower: true,
        lender: true,
      },
    });

    if (!loan) {
      throw new NotFoundException(`Loan with ID ${id} not found`);
    }

    if (loan.status === LoanStatus.REPAID) {
      throw new ForbiddenException(
        'You can not transfer an already paid loan, please create a new loan',
      );
    }

    if (newBorrowerId && newPartyEmail) {
      throw new ForbiddenException(
        'Cannot transfer loan to both a registered user and an email simultaneously. Please choose one transfer method.',
      );
    }

    // Scenario 1: Transfer to a registered borrower
    if (newBorrowerId) {
      // Validate that the current user is the lender
      if (loan.lenderId !== userId) {
        throw new UnauthorizedException(
          'Only the lender can transfer the loan to a registered borrower',
        );
      }

      const newBorrower = await this.prisma.user.findUnique({
        where: { id: newBorrowerId, isDeleted: false },
      });

      if (!newBorrower) {
        throw new NotFoundException(`User with ID ${newBorrowerId} not found`);
      }

      if (loan.borrowerId === newBorrowerId) {
        throw new BadRequestException(
          'Loan is already assigned to this borrower',
        );
      }

      // Perform the transfer
      return await this.prisma.$transaction(async (tx) => {
        // Create transactions for both lender (OUT) and new borrower (IN)
        const lenderTransaction = this.createLoanTransactionTemplate(
          loan.amount,
          loan.description,
          TransactionDirection.OUT,
          loan.lenderId,
          loan.groupId,
          `Loan given to ${newBorrower.firstName}`,
        );

        const borrowerTransaction = this.createLoanTransactionTemplate(
          loan.amount,
          loan.description,
          TransactionDirection.IN,
          newBorrowerId,
          loan.groupId,
          `Loan received from ${loan.lender.firstName}`,
        );

        // Update the loan with new borrower and transactions
        return await tx.loan.update({
          where: { id },
          data: {
            borrowerId: newBorrowerId,
            borrowerEmail: null,
            lenderEmail: null,
            transactions: {
              updateMany: {
                where: { loanId: id, isDeleted: false },
                data: { isDeleted: true },
              },
              create: [lenderTransaction, borrowerTransaction],
            },
          },
          include: {
            transactions: { where: { isDeleted: false } },
            lender: true,
            borrower: true,
          },
        });
      });
    }

    // Scenario 2: Transfer to an unregistered party via email
    if (newPartyEmail) {
      const isAuthorizedUser =
        loan.lenderId === userId || loan.borrowerId === userId;

      if (!isAuthorizedUser) {
        throw new UnauthorizedException(
          'Only the lender or current borrower can transfer the loan',
        );
      }

      // Determine if we're updating lender or borrower email
      const isUserLender = loan.lenderId === userId;

      // Perform the transfer
      return await this.prisma.$transaction(async (tx) => {
        // Prepare new transaction for the registered party
        const newTransaction = this.createLoanTransactionTemplate(
          loan.amount,
          loan.description,
          isUserLender ? TransactionDirection.OUT : TransactionDirection.IN,
          isUserLender ? loan.lenderId : loan.borrowerId,
          loan.groupId,
          isUserLender
            ? 'Loan with new lender contact'
            : 'Loan with new borrower contact',
        );

        // Update the loan with new email and transactions
        return await tx.loan.update({
          where: { id },
          data: {
            ...(isUserLender
              ? { lenderEmail: null, borrowerEmail: newPartyEmail }
              : { lenderEmail: newPartyEmail, borrowerEmail: null }),
            ...(isUserLender
              ? { lenderId: userId, borrowerId: null }
              : { lenderId: null, borrowerId: userId }),
            transactions: {
              // Mark existing transactions as deleted
              updateMany: {
                where: { loanId: id, isDeleted: false },
                data: { isDeleted: true },
              },
              create: newTransaction,
            },
          },
          include: {
            transactions: { where: { isDeleted: false } },
            lender: true,
            borrower: true,
          },
        });
      });
    }

    throw new BadRequestException(
      'Must provide either a new borrower ID or a new party email',
    );
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
