import { Injectable } from '@nestjs/common';
import {
  Transaction,
  Prisma,
  TransactionCategory,
  TransactionDirection,
  LoanStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { GetTransactionsDto, LoanFilterType } from './dto/get-transactions.dto';

export type TransactionTotal =
  | number
  | {
      in: number;
      out: number;
      total: number;
    };

export interface TransactionSummary {
  transactions: Transaction[];
  total: TransactionTotal;
  transactionCount: number;
}

@Injectable()
export class TransactionService {
  constructor(private prisma: PrismaService) {}

  private async calculateGroupTotals(
    commonFilters: Prisma.TransactionWhereInput,
    groupId: number,
    userId: number,
    filterByPayer: boolean,
    loanFilter: Prisma.TransactionWhereInput,
    direction?: TransactionDirection,
  ) {
    const totals = await this.prisma.transaction.groupBy({
      where: {
        ...commonFilters,
        ...loanFilter,
        groupId,
        ...(direction ? { direction } : {}),
        ...(filterByPayer ? { payerId: userId } : {}),
      },
      by: ['groupId'],
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    });

    return {
      total: totals[0]?._sum.amount ?? 0,
      count: totals[0]?._count._all ?? 0,
    };
  }

  private async calculateDirectionalTotals(
    commonFilters: Prisma.TransactionWhereInput,
    userId: number,
    direction: TransactionDirection,
    loanFilter: Prisma.TransactionWhereInput,
  ) {
    const totals = await this.prisma.transaction.groupBy({
      where: {
        ...commonFilters,
        ...loanFilter,
        payerId: userId,
        direction,
      },
      by: ['direction'],
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    });

    return {
      total: totals[0]?._sum.amount ?? 0,
      count: totals[0]?._count._all ?? 0,
    };
  }

  private async calculateUserTotals(
    commonFilters: Prisma.TransactionWhereInput,
    userId: number,
    loanFilter: Prisma.TransactionWhereInput,
    direction?: TransactionDirection,
  ) {
    const totals = await this.prisma.transaction.groupBy({
      where: {
        ...commonFilters,
        ...loanFilter,
        payerId: userId,
        ...(direction ? { direction } : {}),
      },
      by: ['direction'],
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    });

    if (direction) {
      const directionTotal = totals.find((t) => t.direction === direction);
      return {
        amounts: {
          in:
            direction === TransactionDirection.IN
              ? (directionTotal?._sum.amount ?? 0)
              : 0,
          out:
            direction === TransactionDirection.OUT
              ? (directionTotal?._sum.amount ?? 0)
              : 0,
          total: directionTotal?._sum.amount ?? 0,
        },
        count: directionTotal?._count._all ?? 0,
      };
    }

    const inTotal = totals.find((t) => t.direction === TransactionDirection.IN);
    const outTotal = totals.find(
      (t) => t.direction === TransactionDirection.OUT,
    );

    return {
      amounts: {
        in: inTotal?._sum.amount ?? 0,
        out: outTotal?._sum.amount ?? 0,
        total: (inTotal?._sum.amount ?? 0) + (outTotal?._sum.amount ?? 0),
      },
      count: totals.reduce((acc, curr) => acc + curr._count._all, 0),
    };
  }

  async getTransactions(
    params: GetTransactionsDto & { userId: number },
  ): Promise<TransactionSummary> {
    const {
      userId,
      category,
      groupId,
      direction,
      startDate,
      endDate,
      page = 1,
      pageSize = 10,
      filterByPayer = false,
      loanStatus,
      loanFilter = LoanFilterType.ALL,
    } = params;

    const commonFilters: Prisma.TransactionWhereInput = {
      isDeleted: false,
      ...(category ? { category } : {}),
      ...(startDate || endDate
        ? {
            date: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    };

    const getLoanFilter = (
      filterType: LoanFilterType,
      status?: LoanStatus | 'OVERDUE',
    ): Prisma.TransactionWhereInput => {
      const isOverdue = status === 'OVERDUE';
      const statusCondition = isOverdue
        ? { dueDate: { lt: new Date() }, status: LoanStatus.ACTIVE }
        : status
          ? { status }
          : undefined;

      let filter: Prisma.TransactionWhereInput;

      switch (filterType) {
        case LoanFilterType.SPLIT_ONLY:
          filter = {
            loan: {
              AND: [
                { OR: [{ splits: { some: {} } }, { parentId: { not: null } }] },
                ...(statusCondition ? [statusCondition] : []),
              ],
            },
          };
          break;

        case LoanFilterType.REGULAR:
          filter = {
            loan: {
              AND: [
                { parentId: null },
                { splits: { none: {} } },
                ...(statusCondition ? [statusCondition] : []),
              ],
            },
          };
          break;

        case LoanFilterType.ALL:
        default:
          filter = statusCondition ? { loan: statusCondition } : {};
          break;
      }

      return filter;
    };

    const loanType =
      category === TransactionCategory.LOAN
        ? getLoanFilter(loanFilter, loanStatus)
        : {};

    let transactions = await this.prisma.transaction.findMany({
      where: {
        ...commonFilters,
        ...loanType,
        ...(groupId ? { groupId } : {}),
        ...(!groupId || filterByPayer ? { payerId: userId } : {}),
        ...(direction ? { direction } : {}),
      },
      orderBy: { date: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        loan: {
          include: {
            lender: {
              select: { firstName: true, lastName: true, email: true },
            },
            borrower: {
              select: { firstName: true, lastName: true, email: true },
            },
            parent: {
              select: {
                id: true,
                amount: true,
                lender: { select: { id: true, firstName: true, email: true } },
              },
            },
            splits: {
              where: {
                isDeleted: false,
              },
              select: {
                id: true,
                description: true,
                status: true,
                createdAt: true,
                amount: true,
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
        },
        payer: {
          select: { id: true, firstName: true, email: true },
        },
      },
    });

    if (
      category === TransactionCategory.LOAN &&
      loanFilter === LoanFilterType.SPLIT_ONLY
    ) {
      transactions = transactions.filter((transaction) => {
        const loan = transaction.loan;
        if (!loan) return false;
        if (loan.splits.length > 0) {
          return transaction.direction === TransactionDirection.OUT;
        }
        return true;
      });
    }

    if (groupId) {
      const totals = await this.calculateGroupTotals(
        commonFilters,
        groupId,
        userId,
        filterByPayer,
        category === TransactionCategory.LOAN ? loanType : {},
        direction, // Pass the direction parameter here
      );

      return {
        transactions,
        total: totals.total,
        transactionCount: totals.count,
      };
    }

    if (direction) {
      const totals = await this.calculateDirectionalTotals(
        commonFilters,
        userId,
        direction,
        category === TransactionCategory.LOAN ? loanType : {},
      );

      return {
        transactions,
        total: totals.total,
        transactionCount: totals.count,
      };
    }

    const totals = await this.calculateUserTotals(
      commonFilters,
      userId,
      category === TransactionCategory.LOAN ? loanType : {},
      direction, // Pass the direction parameter here
    );

    return {
      transactions,
      total: totals.amounts,
      transactionCount: totals.count,
    };
  }
}
