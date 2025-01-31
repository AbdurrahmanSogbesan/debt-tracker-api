import { forwardRef, Module } from '@nestjs/common';
import { InvitationService } from './invitation.service';
import { InvitationController } from './invitation.controller';
import { UserModule } from 'src/user/user.module';
import { MailModule } from 'src/mail/mail.module';
import { MembershipModule } from 'src/membership/membership.module';
import { GroupModule } from 'src/group/group.module';
import { NotificationService } from 'src/notification/notification.service';

@Module({
  controllers: [InvitationController],
  providers: [InvitationService, NotificationService],
  exports: [InvitationService],
  imports: [
    forwardRef(() => UserModule),
    MailModule,
    forwardRef(() => MembershipModule),
    GroupModule,
  ],
})
export class InvitationModule {}
