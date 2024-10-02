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
    const isUserLender = data.direction === TransactionDirection.OUT;

    return await this.prisma.loan.create({
      data: {
        description: data.description,
        amount: data.amount,
        lender: { connect: { id: isUserLender ? userId : otherUserId } },
        borrower: { connect: { id: isUserLender ? otherUserId : userId } },
        isAcknowledged: false,
        group: data.group
          ? { connect: { id: data.group.connect.id } }
          : undefined,
        transaction: {
          create: {
            amount: data.amount,
            description: data.description || 'Loan transaction',
            category: TransactionCategory.LOAN,
            direction: data.direction,
            date: new Date(),
            payer: {
              connect: { id: isUserLender ? userId : otherUserId },
            },
            group: data.group
              ? { connect: { id: data.group.connect.id } }
              : undefined,
          },
        },
      },
      include: {
        transaction: true,
        lender: true,
        borrower: true,
      },
    });
  }

  async getLoanById(id: number, userId: number): Promise<Loan | null> {
    const loan = await this.prisma.loan.findUnique({
      where: { id, isDeleted: false },
      include: {
        transaction: true,
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
      include: { transaction: true },
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
        transaction: {
          update: {
            amount: data.amount,
            description: data.description,
            date: new Date(),
          },
        },
      },
      include: {
        transaction: true,
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
      include: { transaction: true, borrower: true },
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
        transaction: {
          update: {
            description: `Loan transferred from ${loan.borrower.email} to ${newBorrower.email}`,
          },
        },
      },
      include: {
        transaction: true,
        lender: true,
        borrower: true,
      },
    });
  }

  async deleteLoan(id: number, userId: number) {
    const loan = await this.prisma.loan.findUnique({
      where: { id, isDeleted: false, lenderId: userId },
      include: { transaction: true },
    });

    if (!loan) {
      throw new NotFoundException(`Loan with ID ${id} not found`);
    }

    return await this.prisma.loan.update({
      where: { id },
      data: {
        isDeleted: true,
        transaction: {
          update: {
            data: { isDeleted: true },
          },
        },
      },
    });
  }
}
