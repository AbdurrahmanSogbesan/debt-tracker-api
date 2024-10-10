import { Injectable } from '@nestjs/common';
import {
  Transaction,
  Prisma,
  TransactionCategory,
  TransactionDirection,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { GetTransactionsDto } from './dto/get-transactions.dto';

export interface TransactionSummary {
  transactions: Transaction[];
  total: number | { in: number; out: number; total: number };
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
      direction,
      startDate,
      endDate,
      page = 1,
      pageSize = 10,
    } = params;

    const baseWhere: Prisma.TransactionWhereInput = {
      isDeleted: false,
      category,
      ...(startDate || endDate
        ? { date: { gte: startDate, lte: endDate } }
        : {}),
      payerId: userId, // This now covers both regular transactions and loan transactions
    };

    const [transactions, aggregations] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { ...baseWhere, direction },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          loan: {
            include: {
              lender: {
                select: {
                  firstName: true,
                  email: true,
                },
              },
              borrower: {
                select: {
                  firstName: true,
                  email: true,
                },
              },
            },
          },
          payer: {
            select: {
              id: true,
              firstName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.transaction.aggregate({
        where: { ...baseWhere, direction },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    let totalAmount: number | { in: number; out: number; total: number };
    let transactionCount: number;

    if (!direction) {
      const [inAggregate, outAggregate] = await Promise.all([
        this.prisma.transaction.aggregate({
          where: { ...baseWhere, direction: TransactionDirection.IN },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.prisma.transaction.aggregate({
          where: { ...baseWhere, direction: TransactionDirection.OUT },
          _sum: { amount: true },
          _count: { _all: true },
        }),
      ]);

      const inAmount = inAggregate._sum.amount || 0;
      const outAmount = outAggregate._sum.amount || 0;

      totalAmount = {
        in: inAmount,
        out: outAmount,
        total: inAmount + outAmount,
      };
      transactionCount =
        (inAggregate._count._all || 0) + (outAggregate._count._all || 0);
    } else {
      totalAmount = aggregations._sum.amount || 0;
      transactionCount = aggregations._count._all || 0;
    }

    return {
      transactions,
      total: totalAmount,
      transactionCount,
    };
  }
}
