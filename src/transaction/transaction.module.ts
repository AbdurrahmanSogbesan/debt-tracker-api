import { Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { TransactionController } from './transaction.controller';
import { GroupService } from 'src/group/group.service';

@Module({
  controllers: [TransactionController],
  providers: [TransactionService, GroupService],
})
export class TransactionModule {}
