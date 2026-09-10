import { Logger, Module } from '@nestjs/common';
import { LoanService } from './loan.service';
import { LoanReminderScheduler } from './loan-reminder.scheduler';
import { LoanController } from './loan.controller';
import { GroupService } from 'src/group/group.service';
import { MembershipService } from 'src/membership/membership.service';
import { NotificationService } from 'src/notification/notification.service';

@Module({
  controllers: [LoanController],
  providers: [
    LoanService,
    LoanReminderScheduler,
    GroupService,
    MembershipService,
    NotificationService,
  ],
})
export class LoanModule {}
