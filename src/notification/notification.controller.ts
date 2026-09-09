import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtGuard, RegisteredUserGuard } from 'src/auth/guard';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { AuthUser } from 'src/auth/auth-user';
import { CreateNotificationDto } from './dtos/create-notfication.dto';
import { FetchNotificationsDto } from './dtos/fetch-notification.dto';

@UseGuards(JwtGuard, RegisteredUserGuard)
@Controller('notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}
  @Post()
  async createNotification(@Body() data: CreateNotificationDto) {
    return await this.notificationService.createNotification(data);
  }

  @Get()
  async getAllNotifications(
    @CurrentUser() user: AuthUser,
    @Query() query: FetchNotificationsDto,
  ) {
    return await this.notificationService.getAllNotifications(
      user.userId,
      query,
    );
  }

  @Patch('read-all')
  async markAllAsRead(@CurrentUser() user: AuthUser) {
    await this.notificationService.markAllAsRead(user.userId);
    return { success: true, message: 'All notifications marked as read' };
  }

  @Get(':id')
  async getSingleNotification(
    @CurrentUser() user: AuthUser,
    @Param('id') notificationId: number,
  ) {
    return await this.notificationService.getSingleNotification(
      user.userId,
      +notificationId,
    );
  }

  @Patch(':id/read')
  async markAsRead(
    @CurrentUser() user: AuthUser,
    @Param('id') notificationId: number,
  ) {
    return await this.notificationService.markNotificationAsRead(
      user.userId,
      +notificationId,
    );
  }

  @Patch(':id/delete')
  async deleteNotification(
    @CurrentUser() user: AuthUser,
    @Param('id') notificationId: number,
  ) {
    return await this.notificationService.deleteNotification(
      user.userId,
      +notificationId,
    );
  }
}
