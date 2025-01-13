import {
  Controller,
  Post,
  Body,
  Request,
  UseGuards,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { TransactionService, TransactionSummary } from './transaction.service';
import { JwtGuard } from '../auth/guard';
import { GroupService } from '../group/group.service';
import { GetTransactionsDto } from './dto/get-transactions.dto';
import { Transaction } from '@prisma/client';

@UseGuards(JwtGuard)
@Controller('transaction')
export class TransactionController {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly groupService: GroupService,
  ) {}

  @Get()
  async getTransactions(
    @Query() query: GetTransactionsDto,
    @Request() req,
  ): Promise<TransactionSummary> {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);

    const transactionsQuery = { ...query, userId };

    return this.transactionService.getTransactions(transactionsQuery);
  }
}
