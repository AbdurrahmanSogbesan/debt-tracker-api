import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Group, Prisma, GroupRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GroupService {
  constructor(private prisma: PrismaService) {}
  async create(data: Prisma.GroupCreateInput): Promise<Group> {
    return this.prisma.group.create({
      data: {
        ...data,
        members: {
          create: {
            userId: data.creator.connect.id,
            role: GroupRole.ADMIN,
          },
        },
      },
      include: {
        creator: true,
        members: true,
      },
    });
  }

  async getUserIdFromSupabaseUid(supabaseUid: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { supabaseUid },
    });
    if (!user || user.isDeleted) {
      throw new Error('User not found');
    }
    return user.id;
  }

  async find(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: {
            isDeleted: false,
          },
          include: {
            group: {
              include: {
                members: {
                  include: {
                    user: {
                      select: {
                        firstName: true,
                        lastName: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const groups = user.memberships.map((membership) => membership.group);

    if (groups.length === 0) {
      throw new NotFoundException(
        `No active groups found for this user: ${user.firstName}`,
      );
    }

    return groups;
  }

  async findOne(id: number) {
    const group = await this.prisma.group.findUnique({
      where: { id, isDeleted: false },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    return group;
  }

  async update(id: number, data: Prisma.GroupUpdateInput, userId: number) {
    const groupMembership = await this.prisma.groupMembership.findUnique({
      where: {
        groupId_userId: {
          groupId: id,
          userId: userId,
        },
        isDeleted: false,
      },
    });

    if (!groupMembership || groupMembership.role !== GroupRole.ADMIN) {
      throw new ForbiddenException('Only admins can update the group');
    }

    const group = await this.prisma.group.update({
      where: { id },
      data,
    });

    return group;
  }

  async delete(id: number, userId: number) {
    const groupMembership = await this.prisma.groupMembership.findUnique({
      where: {
        groupId_userId: {
          groupId: id,
          userId: userId,
        },
        isDeleted: false,
      },
    });

    if (!groupMembership || groupMembership.role !== GroupRole.ADMIN) {
      throw new ForbiddenException('Only admins can delete the group');
    }
    const group = await this.prisma.group.update({
      where: { id },
      data: {
        isDeleted: true,
      },
    });

    return group;
  }

  async getGroupMembers(groupId: number, userId: number) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId, isDeleted: false },
      include: {
        members: { include: { user: true }, where: { isDeleted: false } },
      },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const member = group.members.find((member) => member.userId === userId);

    if (!member) {
      throw new ForbiddenException('You do not have access to this group');
    }

    return group.members;
  }
}
