import {
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
    // Fetch user names
    const [user, otherUser] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true },
      }),
      this.prisma.user.findUnique({
        where: { id: otherUserId },
        select: { firstName: true },
      }),
    ]);

    const isUserLender = data.direction === TransactionDirection.OUT;
    const lenderName = isUserLender ? user.firstName : otherUser.firstName;
    const borrowerName = isUserLender ? otherUser.firstName : user.firstName;
    const lenderId = isUserLender ? userId : otherUserId;
    const borrowerId = isUserLender ? otherUserId : userId;

    const loanTitle = `Loan from ${lenderName} to ${borrowerName}`;

    return await this.prisma.loan.create({
      data: {
        description: data.description,
        amount: data.amount,
        lender: { connect: { id: lenderId } },
        borrower: { connect: { id: borrowerId } },
        isAcknowledged: false,
        dueDate: data.dueDate,
        group: data.group
          ? { connect: { id: data.group.connect.id } }
          : undefined,
        transactions: {
          create: [
            {
              amount: data.amount,
              description: `Loan given: ${data.description}`,
              category: TransactionCategory.LOAN,
              direction: TransactionDirection.OUT,
              date: new Date(),
              payer: { connect: { id: lenderId } },
              group: data.group
                ? { connect: { id: data.group.connect.id } }
                : undefined,
              title: loanTitle,
            },
            {
              amount: data.amount,
              description: `Loan received: ${data.description}`,
              category: TransactionCategory.LOAN,
              direction: TransactionDirection.IN,
              date: new Date(),
              payer: { connect: { id: borrowerId } },
              group: data.group
                ? { connect: { id: data.group.connect.id } }
                : undefined,
              title: loanTitle,
            },
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
              date: new Date(),
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
      include: { transactions: true, borrower: true },
    });

    if (!loan) {
      throw new NotFoundException(
        `Loan with ID ${id} not found or you're not the lender`,
      );
    }

    const newBorrower = await this.prisma.user.findUnique({
      where: { id: newBorrowerId, isDeleted: false },
    });

    if (!newBorrower) {
      throw new NotFoundException(`User with ID ${newBorrowerId} not found`);
    }

    return await this.prisma.loan.update({
      where: { id },
      data: {
        borrower: { connect: { id: newBorrowerId } },
        transactions: {
          updateMany: {
            where: { loanId: id },
            data: {
              description: `Loan transferred from ${loan.borrower.email} to ${newBorrower.email}`,
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
