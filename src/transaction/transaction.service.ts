import { Injectable } from '@nestjs/common';
import {
  Transaction,
  Prisma,
  TransactionCategory,
  TransactionDirection,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { GetTransactionsDto } from './dto/get-transactions.dto';

@Injectable()
export class TransactionService {
  constructor(private prisma: PrismaService) {}

  // Creating a transaction would be done in the respective services of the different categories(For now, it would just be in the LoanService)

  async getTransactions(
    params: GetTransactionsDto & { userId: number },
  ): Promise<{ transactions: Transaction[]; total: number }> {
    const {
      userId,
      category,
      direction,
      startDate,
      endDate,
      page = 1,
      pageSize = 10,
    } = params;

    const where: Prisma.TransactionWhereInput = {
      category,
      direction,
      ...(startDate || endDate
        ? { date: { gte: startDate, lte: endDate } }
        : {}),
      ...(category === TransactionCategory.LOAN
        ? {
            loan: {
              OR: [{ lenderId: userId }, { borrowerId: userId }],
            },
          }
        : { payerId: userId }),
    };

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { date: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          loan: true,
          splits: true,
          payer: {
            select: {
              id: true,
              firstName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { transactions, total };
  }
}
