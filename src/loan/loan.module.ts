import { Module } from '@nestjs/common';
import { LoanService } from './loan.service';
import { LoanController } from './loan.controller';
import { GroupService } from 'src/group/group.service';
import { MembershipService } from 'src/membership/membership.service';

@Module({
  controllers: [LoanController],
  providers: [LoanService, GroupService, MembershipService],
})
export class LoanModule {}
