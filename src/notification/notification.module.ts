import { forwardRef, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { GroupModule } from 'src/group/group.module';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService],
  imports: [forwardRef(() => GroupModule)],
  exports: [NotificationService],
})
export class NotificationModule {}
