import { forwardRef, Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { InvitationService } from 'src/invitation/invitation.service';
import { GroupService } from 'src/group/group.service';
import { MailService } from 'src/mail/mail.service';
import { MailModule } from 'src/mail/mail.module';
import { InvitationModule } from 'src/invitation/invitation.module';
import { GroupModule } from 'src/group/group.module';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
  imports: [
    MailModule,
    forwardRef(() => InvitationModule),
    forwardRef(() => GroupModule),
    NotificationModule,
  ],
})
export class UserModule {}
