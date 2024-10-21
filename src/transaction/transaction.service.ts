import { Injectable } from '@nestjs/common';
import {
  Transaction,
  Prisma,
  TransactionCategory,
  TransactionDirection,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { GetTransactionsDto } from './dto/get-transactions.dto';

export type TransactionTotal =
  | number
  | {
      in: number;
      out: number;
      total: number;
    };

export interface TransactionSummary {
  type: 'group' | 'direction' | 'user';
  transactions: Transaction[];
  total: TransactionTotal;
  transactionCount: number;
}

@Injectable()
export class TransactionService {
  constructor(private prisma: PrismaService) {}

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
    } = params;

    const commonFilters = {
      isDeleted: false,
      category,
      ...(startDate || endDate
        ? { date: { gte: startDate, lte: endDate } }
        : {}),
    };

    // If groupId is present, we'll ignore direction in our where clause
    const transactionWhere: Prisma.TransactionWhereInput = {
      ...commonFilters,
      ...(groupId && { groupId }),
      ...(!groupId || filterByPayer ? { payerId: userId } : {}),
      ...(!groupId && direction ? { direction } : {}),
    };

    const transactions = await this.prisma.transaction.findMany({
      where: transactionWhere,
      orderBy: { date: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        loan: {
          include: {
            lender: { select: { firstName: true, email: true } },
            borrower: { select: { firstName: true, email: true } },
          },
        },
        payer: {
          select: { id: true, firstName: true, email: true },
        },
      },
    });

    // Handle group queries
    if (groupId) {
      const totals = await this.prisma.transaction.groupBy({
        where: {
          ...commonFilters,
          groupId,
          ...(filterByPayer ? { payerId: userId } : {}),
        },
        by: ['groupId'],
        _sum: { amount: true },
        _count: { _all: true },
      });

      return {
        type: 'group',
        transactions,
        total: totals[0]?._sum.amount ?? 0,
        transactionCount: totals[0]?._count._all ?? 0,
      };
    }

    // Handle direction-only queries
    if (direction) {
      const totals = await this.prisma.transaction.groupBy({
        where: {
          ...commonFilters,
          payerId: userId,
          direction,
        },
        by: ['direction'],
        _sum: { amount: true },
        _count: { _all: true },
      });

      return {
        type: 'direction',
        transactions,
        total: totals[0]?._sum.amount ?? 0,
        transactionCount: totals[0]?._count._all ?? 0,
      };
    }

    // Handle user-only queries (no direction, no group)
    const totals = await this.prisma.transaction.groupBy({
      where: {
        ...commonFilters,
        payerId: userId,
      },
      by: ['direction'],
      _sum: { amount: true },
      _count: { _all: true },
    });

    const inTotal = totals.find((t) => t.direction === TransactionDirection.IN);
    const outTotal = totals.find(
      (t) => t.direction === TransactionDirection.OUT,
    );

    return {
      type: 'user',
      transactions,
      total: {
        in: inTotal?._sum.amount ?? 0,
        out: outTotal?._sum.amount ?? 0,
        total: (inTotal?._sum.amount ?? 0) + (outTotal?._sum.amount ?? 0),
      },
      transactionCount: totals.reduce((acc, curr) => acc + curr._count._all, 0),
    };
  }
}
