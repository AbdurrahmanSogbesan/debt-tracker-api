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
import { UpdateLoanDto } from './dto/update-individual-loan.dto';

@Injectable()
export class LoanService {
  constructor(private prisma: PrismaService) {}

  async getUserByEmail(email: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user || user.isDeleted) {
      throw new NotFoundException(`User with email ${email} not found`);
    }
    return user;
  }

  async createLoan(
    data: LoanCreateInput,
    userId: number,
    otherUserId: number,
  ): Promise<Loan> {
    // Function to fetch user by ID
    const getUserFirstName = async (id: number) => {
      const user = await this.prisma.user.findUnique({
        where: { id },
        select: { firstName: true },
      });
      return user?.firstName;
    };

    // Fetch user names in parallel
    const [userFirstName, otherUserFirstName] = await Promise.all([
      getUserFirstName(userId),
      getUserFirstName(otherUserId),
    ]);

    // Determine if the current user is the lender
    const isUserLender = data.direction === TransactionDirection.OUT;
    const lenderId = isUserLender ? userId : otherUserId;
    const borrowerId = isUserLender ? otherUserId : userId;
    const lenderName = isUserLender ? userFirstName : otherUserFirstName;
    const borrowerName = isUserLender ? otherUserFirstName : userFirstName;

    // Generate loan title
    const loanTitle = `Loan from ${lenderName} to ${borrowerName}`;

    // Simplified group connection logic
    const groupConnect = data.group
      ? {
          connect: {
            id:
              typeof data.group === 'number'
                ? data.group
                : data.group?.connect?.id,
          },
        }
      : undefined;

    // Transaction creation template
    const createTransaction = (
      direction: TransactionDirection,
      payerId: number,
      description: string,
    ) => ({
      amount: data.amount,
      description,
      category: TransactionCategory.LOAN,
      direction,
      date: new Date(),
      payer: { connect: { id: payerId } },
      group: groupConnect,
      title: loanTitle,
    });

    return await this.prisma.loan.create({
      data: {
        description: data.description,
        amount: data.amount,
        lender: { connect: { id: lenderId } },
        borrower: { connect: { id: borrowerId } },
        isAcknowledged: false,
        dueDate: data.dueDate,
        group: groupConnect,
        transactions: {
          create: [
            createTransaction(
              TransactionDirection.OUT,
              lenderId,
              `Loan given: ${data.description}`,
            ),
            createTransaction(
              TransactionDirection.IN,
              borrowerId,
              `Loan received: ${data.description}`,
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

  async getLoanById(id: number, userId: number): Promise<Loan | null> {
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
    return loan;
  }

  async updateLoan(
    id: number,
    data: UpdateLoanDto,
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
        `The loan is already assigned to this borrower (ID: ${newBorrowerId})`,
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

    return await this.prisma.$transaction(async (prisma) => {
      // Update the loan
      const updatedLoan = await prisma.loan.update({
        where: { id },
        data: {
          borrower: { connect: { id: newBorrowerId } },
        },
        include: {
          transactions: true,
          lender: true,
          borrower: true,
        },
      });

      // Update the lender's transaction
      await prisma.transaction.update({
        where: { id: lenderTransaction.id },
        data: {
          title: newLoanTitle,
          description: `Loan given: ${loan.description} (Transferred to ${newBorrower.firstName})`,
        },
      });

      // Mark the old borrower's transaction as deleted
      await prisma.transaction.update({
        where: { id: oldBorrowerTransaction.id },
        data: {
          isDeleted: true,
          description: `Loan received: ${loan.description} (Transferred Loan to ${newBorrower.firstName})`,
        },
      });

      // Create a new transaction for the new borrower
      await prisma.transaction.create({
        data: {
          amount: loan.amount,
          description: `Loan received: ${loan.description} (Transferred Loan from ${loan.borrower.firstName})`,
          category: TransactionCategory.LOAN,
          direction: TransactionDirection.IN,
          date: new Date(),
          payer: { connect: { id: newBorrowerId } },
          group: loan.groupId ? { connect: { id: loan.groupId } } : undefined,
          title: newLoanTitle,
          loan: { connect: { id: loan.id } },
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
}
