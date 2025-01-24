import { forwardRef, Module } from '@nestjs/common';
import { GroupService } from './group.service';
import { GroupController } from './group.controller';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  controllers: [GroupController],
  providers: [GroupService],
  imports: [forwardRef(() => NotificationModule)],
  exports: [GroupService],
})
export class GroupModule {}
