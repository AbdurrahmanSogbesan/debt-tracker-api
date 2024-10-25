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
import { SplitLoanInput } from './dto/create-split-loan.dto';
import { MembershipService } from 'src/membership/membership.service';
import { UpdateSplitLoanServiceInput } from './dto/update-split-loan.dto';

@Injectable()
export class LoanService {
  private membershipService: MembershipService;
  constructor(private prisma: PrismaService) {
    this.membershipService = new MembershipService(this.prisma);
  }

  async getUserByEmail(email: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user || user.isDeleted) {
      throw new NotFoundException(`User with email ${email} not found`);
    }
    return user;
  }

  async getUserIdsByEmails(emails: string[]): Promise<number[]> {
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
        `Users not found for emails: ${missingEmails.join(', ')}`,
      );
    }

    return users.map((user) => user.id);
  }

  private createTransactionTemplate(
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
            this.createTransactionTemplate(
              data.amount,
              data.description,
              TransactionDirection.OUT,
              lenderId,
              data.groupId,
              loanTitle,
            ),
            this.createTransactionTemplate(
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

  async getLoanById(id: number): Promise<Loan | null> {
    const loan = await this.prisma.loan.findUnique({
      where: { id, isDeleted: false },
      include: {
        lender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        borrower: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        splits: {
          where: { isDeleted: false },
          include: {
            lender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            borrower: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        parent: {
          include: {
            lender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            borrower: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
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
            create: this.createTransactionTemplate(
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
    data: SplitLoanInput,
    creatorId: number,
  ): Promise<Loan> {
    const group = await this.membershipService.getGroupWithMembers(
      data.groupId,
      {},
      { members: { where: { isDeleted: false } }, creator: true },
    );

    const invalidMembers = data.memberSplits.filter(
      (split) =>
        !group.members.some(
          (member) => member.userId === split.userId && !member.isDeleted,
        ),
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
    const parentLoanTitle = `Loan from ${creatorName} to Group`;
    const parentDescription = `${data.description} (Group Total)`;

    // Create the parent loan with single transaction
    const parentLoan = await this.prisma.loan.create({
      data: {
        amount: totalAmount,
        description: parentDescription,
        dueDate: data.dueDate,
        isAcknowledged: false,
        status: LoanStatus.ACTIVE,
        lender: { connect: { id: creatorId } },
        // borrower: null,
        group: { connect: { id: data.groupId } },
        transactions: {
          create: this.createTransactionTemplate(
            totalAmount,
            parentDescription,
            TransactionDirection.OUT,
            creatorId,
            data.groupId,
            parentLoanTitle,
          ),
        },
      },
    });

    // Create individual loans and their transactions
    const memberLoansPromises = data.memberSplits.map(async (split) => {
      if (split.userId === creatorId) return null;

      const borrowerName = await this.getUserFirstName(split.userId);
      const loanTitle = `Loan from ${creatorName} to ${borrowerName}`;

      return await this.prisma.loan.create({
        data: {
          amount: split.amount,
          description: data.description,
          dueDate: data.dueDate,
          isAcknowledged: false,
          status: LoanStatus.ACTIVE,
          lender: { connect: { id: creatorId } },
          borrower: { connect: { id: split.userId } },
          group: { connect: { id: data.groupId } },
          parent: { connect: { id: parentLoan.id } },
          transactions: {
            create: [
              this.createTransactionTemplate(
                split.amount,
                data.description,
                TransactionDirection.OUT,
                creatorId,
                data.groupId,
                loanTitle,
              ),
              this.createTransactionTemplate(
                split.amount,
                data.description,
                TransactionDirection.IN,
                split.userId,
                data.groupId,
                loanTitle,
              ),
            ],
          },
        },
      });
    });

    await Promise.all(memberLoansPromises.filter(Boolean));

    return this.getLoanById(parentLoan.id);
  }

  async getGroupLoanSplits(
    loanId: number,
  ): Promise<{ parent: Loan; splits: Loan[] }> {
    // Get the parent loan first
    const parentLoan = await this.prisma.loan.findUnique({
      where: {
        id: loanId,
        isDeleted: false,
        parentId: null, // Ensure we're getting a parent loan
      },
      include: {
        lender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        borrower: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        transactions: {
          where: { isDeleted: false },
        },
      },
    });

    if (!parentLoan) {
      throw new NotFoundException(`Parent loan with ID ${loanId} not found`);
    }

    // Get all split loans for this parent
    const splitLoans = await this.prisma.loan.findMany({
      where: {
        parentId: loanId,
        isDeleted: false,
      },
      include: {
        lender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        borrower: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        transactions: {
          where: { isDeleted: false },
        },
      },
    });

    if (splitLoans.length === 0) {
      throw new NotFoundException(
        `No split loans found for parent loan ID ${loanId}`,
      );
    }

    return {
      parent: parentLoan,
      splits: splitLoans,
    };
  }

  async updateSplitLoan(
    id: number,
    data: UpdateSplitLoanServiceInput,
    creatorId: number,
  ): Promise<Loan> {
    // First verify the loan exists and user has permission to update it
    const existingLoan = await this.prisma.loan.findUnique({
      where: {
        id,
        isDeleted: false,
        lenderId: creatorId,
      },
      include: {
        transactions: true,
        group: {
          include: {
            members: {
              where: { isDeleted: false },
            },
          },
        },
      },
    });

    if (!existingLoan) {
      throw new NotFoundException(`Loan with ID ${id} not found`);
    }

    // If no member splits provided, handle as regular loan update
    if (!data.memberSplits || data.memberSplits.length === 0) {
      return this.updateLoan(id, data, creatorId);
    }

    // Verify all users are active members of the group
    const invalidMembers = data.memberSplits.filter(
      (split) =>
        !existingLoan.group.members.some(
          (member) => member.userId === split.userId && !member.isDeleted,
        ),
    );

    if (invalidMembers.length > 0) {
      const invalidUserIds = invalidMembers.map((m) => m.userId).join(', ');
      throw new NotFoundException(
        `The following users are not active members of this group: ${invalidUserIds}`,
      );
    }

    // Calculate new total amount
    const totalAmount = data.memberSplits.reduce(
      (sum, split) => sum + split.amount,
      0,
    );

    const creatorName = await this.getUserFirstName(creatorId);
    // const parentLoanTitle = `Loan from ${creatorName} to Group`;
    const parentDescription = data.description
      ? `${data.description} (Group Total)`
      : existingLoan.description;

    // Update the parent loan and its transaction
    const updatedLoan = await this.prisma.$transaction(async (prisma) => {
      // Update parent loan
      const parentLoan = await prisma.loan.update({
        where: { id },
        data: {
          amount: totalAmount,
          description: parentDescription,
          dueDate: data.dueDate ?? existingLoan.dueDate,
          isAcknowledged: data.isAcknowledged ?? existingLoan.isAcknowledged,
          status: data.status ?? existingLoan.status,
          transactions: {
            updateMany: {
              where: { loanId: id, isDeleted: false },
              data: {
                amount: totalAmount,
                description: parentDescription,
              },
            },
          },
        },
      });

      // Handle child loans - first get existing ones
      const existingChildLoans = await prisma.loan.findMany({
        where: {
          parentId: id,
          isDeleted: false,
        },
      });

      // Update or create child loans for each member split
      for (const split of data.memberSplits) {
        const existingChildLoan = existingChildLoans.find(
          (loan) => loan.borrowerId === split.userId,
        );

        const childLoanData = {
          amount: split.amount,
          description: data.description ?? existingLoan.description,
          dueDate: data.dueDate,
          isAcknowledged:
            data.isAcknowledged ?? existingChildLoan.isAcknowledged,
          status: data.status,
          lenderId: creatorId,
          borrowerId: split.userId,
          groupId: existingLoan.groupId,
          parentId: id,
          transactions: {
            updateMany: {
              where: { loanId: existingChildLoan?.id },
              data: {
                amount: split.amount,
                description: data.description || existingLoan.description,
              },
            },
          },
        };

        if (existingChildLoan) {
          await prisma.loan.update({
            where: { id: existingChildLoan.id },
            data: childLoanData,
          });
        } else {
          // Create new child loan with transaction
          await prisma.loan.create({
            data: {
              ...childLoanData,
              transactions: {
                create: this.createTransactionTemplate(
                  split.amount,
                  data.description || existingLoan.description,
                  TransactionDirection.OUT,
                  split.userId,
                  parentLoan.groupId,
                  `Loan from ${creatorName}`,
                ),
              },
            },
          });
        }
      }

      // Soft delete any child loans that are no longer needed
      const updatedUserIds = data.memberSplits.map((split) => split.userId);
      await prisma.loan.updateMany({
        where: {
          parentId: id,
          borrowerId: {
            notIn: updatedUserIds,
          },
          isDeleted: false,
        },
        data: {
          isDeleted: true,
        },
      });

      return parentLoan;
    });

    return this.prisma.loan.findUnique({
      where: { id: updatedLoan.id },
      include: {
        transactions: true,
        lender: true,
        borrower: true,
        splits: {
          where: { isDeleted: false },
          include: {
            transactions: true,
            borrower: true,
          },
        },
      },
    });
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
