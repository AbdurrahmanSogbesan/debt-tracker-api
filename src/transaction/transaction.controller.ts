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
import { SearchTransactionsDto } from './dto/search-transactions.dto';

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

  @Get('/search')
  async searchTransactions(
    @Query() query: SearchTransactionsDto,
    @Request() req,
  ) {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);

    // Merge the validated query params with the userId
    const searchParams = {
      ...query,
      userId,
    };

    return this.transactionService.searchTransactions(searchParams);
  }
}
