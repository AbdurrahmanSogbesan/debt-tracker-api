import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtGuard } from 'src/auth/guard';
import { CreateNotificationDto } from './dtos/create-notfication.dto';
import { GroupService } from 'src/group/group.service';
import { FetchNotificationsDto } from './dtos/fetch-notification.dto';

@UseGuards(JwtGuard)
@Controller('notification')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly groupService: GroupService,
  ) {}
  @Post()
  async createNotification(
    @Body() data: CreateNotificationDto,
    @Request() req,
  ) {
    return await this.notificationService.createNotification(data);
  }

  @Get()
  async getAllNotifications(
    @Request() req,
    @Query() query: FetchNotificationsDto,
  ) {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);
    return await this.notificationService.getAllNotifications(userId, query);
  }

  @Get(':id')
  async getSingleNotification(
    @Request() req,
    @Param('id') notificationId: number,
  ) {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);
    return await this.notificationService.getSingleNotification(
      userId,
      +notificationId,
    );
  }

  @Patch(':id/read')
  async markAsRead(@Request() req, @Param('id') notificationId: number) {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);

    return await this.notificationService.markNotificationAsRead(
      userId,
      +notificationId,
    );
  }

  @Patch(':id/delete')
  async deleteNotification(
    @Request() req,
    @Param('id') notificationId: number,
  ) {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);

    return await this.notificationService.deleteNotification(
      userId,
      +notificationId,
    );
  }
}
