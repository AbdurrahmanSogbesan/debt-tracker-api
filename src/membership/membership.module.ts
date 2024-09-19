import { Module } from '@nestjs/common';
import { MembershipService } from './membership.service';
import { MembershipController } from './membership.controller';
import { GroupService } from '../group/group.service';

@Module({
  controllers: [MembershipController],
  providers: [MembershipService, GroupService],
})
export class MembershipModule {}
