import { forwardRef, Module } from '@nestjs/common';
import { MembershipService } from './membership.service';
import { MembershipController } from './membership.controller';
import { GroupService } from '../group/group.service';
import { InvitationService } from 'src/invitation/invitation.service';
import { UserService } from 'src/user/user.service';
import { MailModule } from 'src/mail/mail.module';
import { InvitationModule } from 'src/invitation/invitation.module';
import { GroupModule } from 'src/group/group.module';
import { UserModule } from 'src/user/user.module';
import { NotificationService } from 'src/notification/notification.service';

@Module({
  controllers: [MembershipController],
  providers: [MembershipService, NotificationService],
  imports: [
    MailModule,
    forwardRef(() => InvitationModule),
    GroupModule,
    forwardRef(() => UserModule),
  ],
  exports: [MembershipService],
})
export class MembershipModule {}
