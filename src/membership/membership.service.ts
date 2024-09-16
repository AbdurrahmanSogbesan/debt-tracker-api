import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GroupMembership, Prisma, GroupRole } from '@prisma/client';

@Injectable()
export class MembershipService {
  constructor(private prisma: PrismaService) {}
  private async isGroupMemberAdmin(
    groupId: number,
    userId: number,
  ): Promise<boolean> {
    const groupMembership = await this.prisma.groupMembership.findUnique({
      where: {
        groupId_userId: { groupId, userId },
        isDeleted: false,
      },
    });

    return groupMembership?.role === GroupRole.ADMIN;
  }

  async addMember(groupId: number, userId: number, addedByUserId: number) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { members: true },
    });

    if (!group || group.isDeleted) {
      throw new NotFoundException('Group not found');
    }

    const isAdmin = await this.isGroupMemberAdmin(groupId, addedByUserId);
    if (!isAdmin) {
      throw new ForbiddenException('Only admins can add members');
    }

    const existingMembership = group.members.find(
      (member) => member.userId === userId,
    );

    // If the user has a deleted membership, update it instead of creating a new one
    if (existingMembership) {
      if (!existingMembership.isDeleted) {
        throw new ForbiddenException('User is already a member of this group');
      }
      return this.prisma.groupMembership.update({
        where: {
          groupId_userId: {
            groupId,
            userId,
          },
        },
        data: { isDeleted: false, role: GroupRole.MEMBER },
      });
    }

    // If no membership exists, create a new one
    return this.prisma.groupMembership.create({
      data: {
        groupId,
        userId,
        role: GroupRole.MEMBER,
      },
    });
  }

  async removeMember(groupId: number, userId: number, removedByUserId: number) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: true,
        creator: true,
      },
    });

    if (!group || group.isDeleted) {
      throw new NotFoundException('Group not found');
    }

    const isAdmin = await this.isGroupMemberAdmin(groupId, removedByUserId);
    if (!isAdmin) {
      throw new ForbiddenException('Only admins can remove members');
    }

    const memberToRemove = group.members.find(
      (member) => member.userId === userId && !member.isDeleted,
    );
    if (!memberToRemove) {
      throw new NotFoundException('Member not found in this group');
    }

    if (memberToRemove.isDeleted) {
      throw new BadRequestException('Member is already removed from the group');
    }

    if (group.creator.id === userId) {
      throw new ForbiddenException('Cannot remove the creator of the group');
    }

    await this.prisma.groupMembership.update({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
      data: {
        isDeleted: true,
      },
    });

    return { message: 'Member has been successfully removed from the group' };
  }

  async updateMemberRole(
    groupId: number,
    userId: number,
    updatedByUserId: number,
  ) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { members: true },
    });

    if (!group || group.isDeleted) {
      throw new NotFoundException('Group not found');
    }

    const isAdmin = await this.isGroupMemberAdmin(groupId, updatedByUserId);
    if (!isAdmin) {
      throw new ForbiddenException('Only admins can promote members to admin');
    }

    const memberToUpdate = group.members.find(
      (member) => member.userId === userId && !member.isDeleted,
    );
    if (!memberToUpdate) {
      throw new NotFoundException('Member not found in this group');
    }

    if (memberToUpdate.role === GroupRole.ADMIN) {
      throw new ForbiddenException('User is already an admin');
    }

    return this.prisma.groupMembership.update({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
      data: { role: GroupRole.ADMIN },
    });
  }

  async leaveGroup(groupId: number, userId: number) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { members: { orderBy: { joinedAt: 'asc' } } },
    });

    if (!group || group.isDeleted) {
      throw new NotFoundException('Group not found');
    }

    const membershipToDelete = group.members.find(
      (member) => member.userId === userId && !member.isDeleted,
    );
    if (!membershipToDelete) {
      throw new NotFoundException('User is not a member of this group');
    }

    if (membershipToDelete.role === GroupRole.ADMIN) {
      const nextAdmin = group.members.find(
        (member) => member.userId !== userId && !member.isDeleted,
      );
      if (nextAdmin) {
        await this.prisma.groupMembership.update({
          where: {
            groupId_userId: {
              groupId,
              userId: nextAdmin.userId,
            },
          },
          data: { role: GroupRole.ADMIN },
        });
      } else {
        await this.prisma.group.update({
          where: { id: groupId },
          data: { isDeleted: true },
        });
        return { message: 'Group deleted as the last member left' };
      }
    }

    await this.prisma.groupMembership.update({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
      data: { isDeleted: true },
    });

    return { message: 'Successfully left the group' };
  }
}
