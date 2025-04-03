import {
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateNotificationDto } from './dtos/create-notfication.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { FetchNotificationsDto } from './dtos/fetch-notification.dto';
import { GroupService } from 'src/group/group.service';

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => GroupService))
    private readonly groupService: GroupService,
  ) {}

  async createNotification(data: CreateNotificationDto) {
    const { userIds, loanId, groupId, inviteId, payload, ...rest } = data;

    const notification = await this.prisma.notification.create({
      data: {
        ...rest,
        payload: payload as Prisma.JsonValue,
        ...(loanId && { loan: { connect: { id: loanId } } }),
        ...(groupId && { group: { connect: { id: groupId } } }),
        ...(inviteId && { invite: { connect: { id: inviteId } } }),
      },
    });

    if (userIds && userIds.length > 0) {
      await this.prisma.userNotification.createMany({
        data: userIds.map((userId) => ({
          userId,
          notificationId: notification.id,
        })),
      });
    }

    return notification;
  }

  async getAllNotifications(userId: number, query: FetchNotificationsDto) {
    const { page, limit, type, isRead, groupId } = query;

    const where: Prisma.NotificationWhereInput = {
      userNotifications: {
        some: {
          userId,
          ...(isRead !== undefined && { isRead }),
        },
      },
      ...(type ? { type } : {}),
      ...(groupId ? { groupId } : {}),
      isDeleted: false,
    };

    const totalCount = await this.prisma.notification.count({ where });
    const totalPages = Math.ceil(totalCount / limit);

    const notifications = await this.prisma.notification.findMany({
      where,
      include: {
        userNotifications: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        loan: {
          select: {
            id: true,
            status: true,
            amount: true,
            lender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            borrower: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        group: {
          select: { id: true, name: true, creator: true },
        },
        invite: {
          select: { id: true, email: true, group: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const transformedNotifications = notifications.map((notification) => {
      const isReadForThisUser =
        notification.userNotifications.find((un) => un.userId === userId)
          ?.isRead || false;

      // Extract users from userNotifications
      const users = notification.userNotifications.map((un) => un.user);

      return {
        ...notification,
        isRead: isReadForThisUser,
        users,
        userNotifications: undefined,
      };
    });

    return {
      notifications: transformedNotifications,
      page,
      limit,
      totalPages,
      totalCount,
    };
  }

  async getSingleNotification(userId: number, notificationId: number) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userNotifications: {
          some: {
            userId,
          },
        },
        isDeleted: false,
      },
      include: {
        userNotifications: true,
        loan: true,
        group: true,
        invite: true,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  async markNotificationAsRead(userId: number, notificationId: number) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userNotifications: { some: { userId } },
        isDeleted: false,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.userNotification.update({
      where: {
        userId_notificationId: {
          userId,
          notificationId,
        },
      },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: number) {
    // Check if the user has any notifications
    const userNotifications = await this.prisma.userNotification.findMany({
      where: {
        userId,
        notification: {
          isDeleted: false,
        },
        isRead: false,
      },
    });

    if (!userNotifications || userNotifications.length === 0) {
      throw new NotFoundException('No unread notifications found');
    }

    // Mark all notifications as read for this specific user
    return this.prisma.userNotification.updateMany({
      where: {
        userId,
        notification: { isDeleted: false },
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });
  }

  async deleteNotification(userId: number, notificationId: number) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userNotifications: { some: { userId } },
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isDeleted: true },
    });
  }
}
