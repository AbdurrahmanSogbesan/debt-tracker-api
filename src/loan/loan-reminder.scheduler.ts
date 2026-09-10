import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LoanStatus, NotificationType, Prisma } from '@prisma/client';
import { addDays, differenceInDays, endOfDay, startOfDay } from 'date-fns';
import { PrismaService } from '../prisma/prisma.service';

const PAGE_SIZE = 500;

type DueLoan = {
  id: number;
  amount: number;
  dueDate: Date;
  groupId: number | null;
  lenderId: number | null;
  borrowerId: number | null;
};

@Injectable()
export class LoanReminderScheduler {
  private readonly logger = new Logger(LoanReminderScheduler.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  handleLoanReminders() {
    const now = new Date();
    return this.runExclusively('loan-reminders', (tx) =>
      this.notifyLoans(
        tx,
        {
          status: LoanStatus.ACTIVE,
          isDeleted: false,
          dueDate: { gte: startOfDay(now), lte: endOfDay(addDays(now, 3)) },
        },
        NotificationType.LOAN_REMINDER,
        (loan) => {
          const days = differenceInDays(loan.dueDate, now);
          return days === 0
            ? `Loan payment of $${loan.amount.toFixed(2)} is due today!`
            : `Reminder: Loan payment of $${loan.amount.toFixed(2)} is due in ${days} day${days !== 1 ? 's' : ''}.`;
        },
      ),
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  handleOverdueLoans() {
    const now = new Date();
    return this.runExclusively('overdue-loans', (tx) =>
      this.notifyLoans(
        tx,
        {
          status: LoanStatus.ACTIVE,
          isDeleted: false,
          dueDate: { lt: startOfDay(now) },
        },
        NotificationType.OVERDUE_ALERT,
        (loan) => {
          const days = differenceInDays(now, loan.dueDate);
          return `OVERDUE ALERT: Loan payment of $${loan.amount.toFixed(2)} is ${days} day${days !== 1 ? 's' : ''} past due.`;
        },
      ),
    );
  }

  // @Cron fires in every replica, so the tick is claimed with a transaction-scoped
  // advisory lock: it pins one connection (a session lock can be released on a
  // different pooled connection) and clears itself if the process dies.
  private async runExclusively(
    job: string,
    work: (tx: Prisma.TransactionClient) => Promise<number>,
  ): Promise<{ processed: number; skipped: boolean }> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const [{ locked }] = await tx.$queryRaw<[{ locked: boolean }]>`
            SELECT pg_try_advisory_xact_lock(hashtext(${job})) AS locked`;
          if (!locked) {
            this.logger.log(`${job}: another instance holds this tick`);
            return { processed: 0, skipped: true };
          }
          const processed = await work(tx);
          this.logger.log(`${job}: processed ${processed}`);
          return { processed, skipped: false };
        },
        { timeout: 300_000, maxWait: 10_000 },
      );
    } catch (error) {
      this.logger.error(`${job} failed: ${error.message}`, error.stack);
      return { processed: 0, skipped: false };
    }
  }

  private async notifyLoans(
    tx: Prisma.TransactionClient,
    where: Prisma.LoanWhereInput,
    type: NotificationType,
    message: (loan: DueLoan) => string,
  ): Promise<number> {
    let cursor: number | undefined;
    let processed = 0;

    for (;;) {
      const loans = (await tx.loan.findMany({
        where,
        take: PAGE_SIZE,
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          amount: true,
          dueDate: true,
          groupId: true,
          lenderId: true,
          borrowerId: true,
        },
      })) as DueLoan[];

      if (!loans.length) break;

      const notifications = await tx.notification.createManyAndReturn({
        data: loans.map((loan) => ({
          type,
          message: message(loan),
          loanId: loan.id,
          groupId: loan.groupId,
          payload: { loanId: loan.id, amount: loan.amount },
        })),
      });

      // Match on loanId rather than array position — one notification per loan.
      const notificationByLoan = new Map(
        notifications.map((n) => [n.loanId, n.id]),
      );
      const recipients = loans.flatMap((loan) =>
        [loan.borrowerId, loan.lenderId]
          .filter((id): id is number => !!id)
          .map((userId) => ({
            userId,
            notificationId: notificationByLoan.get(loan.id),
          })),
      );

      if (recipients.length) {
        await tx.userNotification.createMany({
          data: recipients,
          skipDuplicates: true,
        });
      }

      processed += loans.length;
      cursor = loans[loans.length - 1].id;
      if (loans.length < PAGE_SIZE) break;
    }

    return processed;
  }
}
