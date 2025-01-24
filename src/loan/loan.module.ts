import { Module } from '@nestjs/common';
import { LoanService } from './loan.service';
import { LoanController } from './loan.controller';
import { GroupService } from 'src/group/group.service';
import { MembershipService } from 'src/membership/membership.service';
import { NotificationService } from 'src/notification/notification.service';

@Module({
  controllers: [LoanController],
  providers: [
    LoanService,
    GroupService,
    MembershipService,
    NotificationService,
  ],
})
export class LoanModule {}
