import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateNotificationDto } from './dtos/create-notfication.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { FetchNotificationsDto } from './dtos/fetch-notification.dto';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async createNotification(data: CreateNotificationDto) {
    const { userIds, loanId, groupId, inviteId, payload, ...rest } = data;

    return this.prisma.notification.create({
      data: {
        ...rest,
        payload: payload as Prisma.JsonValue,
        users: {
          connect: userIds.map((id) => ({ id })),
        },
        ...(loanId && { loan: { connect: { id: loanId } } }),
        ...(groupId && { group: { connect: { id: groupId } } }),
        ...(inviteId && { invite: { connect: { id: inviteId } } }),
      },
    });
  }

  async getAllNotifications(userId: number, query: FetchNotificationsDto) {
    const { page, limit, type, isRead, groupId } = query;

    const where: Prisma.NotificationWhereInput = {
      users: { some: { id: userId } },
      ...(type && { type }),
      ...(isRead !== undefined && { isRead }),
      ...(groupId ? { groupId } : {}),
      isDeleted: false,
    };

    const totalCount = await this.prisma.notification.count({ where });
    const totalPages = Math.ceil(totalCount / limit);

    const notifications = await this.prisma.notification.findMany({
      where,
      include: {
        users: {
          select: { firstName: true, lastName: true, email: true },
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

    return {
      notifications,
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
        users: { some: { id: userId } },
        isDeleted: false,
      },
      include: {
        users: true,
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
        users: { some: { id: userId } },
        isDeleted: false,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async deleteNotification(userId: number, notificationId: number) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        users: { some: { id: userId } },
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
