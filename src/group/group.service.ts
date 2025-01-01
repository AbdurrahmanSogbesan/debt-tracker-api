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

  async getUserIdFromSupabaseUid(supabaseUid: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { supabaseUid },
    });
    if (!user || user.isDeleted) {
      throw new Error('User not found');
    }
    return user.id;
  }

  async getUserIdsByEmails(emails: string[]): Promise<number[]> {
    const users = await this.prisma.user.findMany({
      where: {
        email: { in: emails },
        isDeleted: false,
      },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  async create(
    data: Omit<Prisma.GroupCreateInput, 'creator' | 'members'> & {
      creatorId: number;
      memberIds: number[];
    },
  ): Promise<Group> {
    const { creatorId, memberIds, ...groupData } = data;

    return this.prisma.group.create({
      data: {
        ...groupData,
        creator: {
          connect: { id: creatorId },
        },
        members: {
          createMany: {
            data: [
              { userId: creatorId, role: GroupRole.ADMIN },
              ...memberIds.map((userId) => ({
                userId,
                role: GroupRole.MEMBER,
              })),
            ],
            skipDuplicates: true,
          },
        },
      },
      include: {
        creator: true,
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
    });
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
                  where: {
                    isDeleted: false,
                  },
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

    return groups;
  }

  async findOne(id: number) {
    const group = await this.prisma.group.findUnique({
      where: { id, isDeleted: false },
      include: {
        transactions: {
          where: {
            isDeleted: false,
          },
          include: {
            loan: {
              where: { isDeleted: false },
              select: {
                splits: {
                  where: { isDeleted: false },
                  include: {
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
                parent: {
                  include: {
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
              },
            },
          },
        },
        creator: true,
        members: {
          where: {
            isDeleted: false,
          },
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
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
    // First check if user has admin rights
    const groupMembership = await this.prisma.groupMembership.findUnique({
      where: {
        groupId_userId: {
          groupId: id,
          userId: userId,
        },
        role: GroupRole.ADMIN,
        isDeleted: false,
      },
    });

    if (!groupMembership) {
      throw new ForbiddenException('Only admins can delete the group');
    }

    // Use transaction to ensure both operations complete successfully
    const result = await this.prisma.$transaction(async (prisma) => {
      // Mark all memberships as deleted
      await prisma.groupMembership.updateMany({
        where: {
          groupId: id,
          isDeleted: false,
        },
        data: {
          isDeleted: true,
        },
      });

      // Mark the group as deleted
      const group = await prisma.group.update({
        where: { id },
        data: {
          isDeleted: true,
        },
      });

      return group;
    });

    return result;
  }

  async getGroupMembers(groupId: number, search?: string) {
    const filters: Prisma.GroupMembershipWhereInput = {
      isDeleted: false,
      ...(search
        ? {
            user: {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        isDeleted: false,
      },
      include: {
        members: {
          where: filters,
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
      },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return group.members;
  }
}
