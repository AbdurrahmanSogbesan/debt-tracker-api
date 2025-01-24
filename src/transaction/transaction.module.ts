import { forwardRef, Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { TransactionController } from './transaction.controller';
import { GroupService } from 'src/group/group.service';
import { GroupModule } from 'src/group/group.module';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  controllers: [TransactionController],
  providers: [TransactionService, GroupService],
  imports: [
    forwardRef(() => GroupModule),
    forwardRef(() => NotificationModule),
  ],
})
export class TransactionModule {}
