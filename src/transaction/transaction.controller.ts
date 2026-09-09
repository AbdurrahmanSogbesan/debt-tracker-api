import { Controller, UseGuards, Get, Query } from '@nestjs/common';
import { TransactionService, TransactionSummary } from './transaction.service';
import { JwtGuard, RegisteredUserGuard } from '../auth/guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { GetTransactionsDto } from './dto/get-transactions.dto';

@UseGuards(JwtGuard, RegisteredUserGuard)
@Controller('transaction')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get()
  async getTransactions(
    @Query() query: GetTransactionsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TransactionSummary> {
    return this.transactionService.getTransactions({
      ...query,
      userId: user.userId,
    });
  }
}
