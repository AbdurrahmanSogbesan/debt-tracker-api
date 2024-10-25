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

    if (!groupMembership) {
      return false;
    }

    return groupMembership.role === GroupRole.ADMIN;
  }

  async getGroupWithMembers(
    groupId: number,
    extraConditions: Omit<Prisma.GroupWhereInput, 'id'> = {},
    includeOptions: Prisma.GroupInclude = { members: true },
  ) {
    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        isDeleted: false,
        ...extraConditions,
      },
      include: includeOptions,
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return group;
  }

  async addMember(groupId: number, userId: number, addedByUserId: number) {
    const group = await this.getGroupWithMembers(groupId);

    const isAdmin = await this.isGroupMemberAdmin(groupId, addedByUserId);
    if (!isAdmin) {
      throw new ForbiddenException('Only admins can add members');
    }

    const existingMembership = group.members.find(
      (member) => member.userId === userId,
    );

    if (existingMembership) {
      if (!existingMembership.isDeleted) {
        throw new ForbiddenException('User is already a member of this group');
      }
      return this.prisma.groupMembership.update({
        where: { groupId_userId: { groupId, userId } },
        data: { isDeleted: false, role: GroupRole.MEMBER },
      });
    }

    return this.prisma.groupMembership.create({
      data: { groupId, userId },
    });
  }

  async removeMember(groupId: number, userId: number, removedByUserId: number) {
    const group = await this.getGroupWithMembers(
      groupId,
      {},
      { members: { where: { isDeleted: false } }, creator: true },
    );

    const isAdmin = await this.isGroupMemberAdmin(groupId, removedByUserId);
    if (!isAdmin) {
      throw new ForbiddenException('Only admins can remove members');
    }

    const memberToRemove = group.members.find(
      (member) => member.userId === userId,
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
      where: { groupId_userId: { groupId, userId } },
      data: { isDeleted: true },
    });

    return { message: 'Member has been successfully removed from the group' };
  }

  async updateMemberRole(
    groupId: number,
    userId: number,
    updatedByUserId: number,
    newRole: GroupRole,
  ) {
    const group = await this.getGroupWithMembers(
      groupId,
      {},
      {
        members: { where: { isDeleted: false } },
      },
    );

    const isAdmin = await this.isGroupMemberAdmin(groupId, updatedByUserId);
    if (!isAdmin) {
      throw new ForbiddenException('Only admins can update member roles');
    }

    // Find the member whose role needs to be updated
    const memberToUpdate = group.members.find(
      (member) => member.userId === userId,
    );
    if (!memberToUpdate) {
      throw new NotFoundException('Member not found in this group');
    }

    // Prevent demoting the last admin
    const adminMembers = group.members.filter(
      (member) => member.role === GroupRole.ADMIN,
    );

    if (
      memberToUpdate.role === GroupRole.ADMIN &&
      newRole === GroupRole.MEMBER
    ) {
      if (adminMembers.length === 1) {
        throw new ForbiddenException('Cannot demote the last admin');
      }
    }

    // If the role is already the new role, no need to update
    if (memberToUpdate.role === newRole) {
      throw new ForbiddenException(
        `User is already a ${newRole.toLowerCase()}`,
      );
    }

    // Update the member's role (promote to admin or demote to member)
    return this.prisma.groupMembership.update({
      where: { groupId_userId: { groupId, userId } },
      data: { role: newRole },
    });
  }

  async leaveGroup(groupId: number, userId: number) {
    // Fetch the group with members, ordered by join date
    const group = await this.getGroupWithMembers(
      groupId,
      {},
      {
        members: { orderBy: { joinedAt: 'asc' }, where: { isDeleted: false } },
      },
    );

    // Find the membership for the user trying to leave
    const membershipToDelete = group.members.find(
      (member) => member.userId === userId,
    );
    if (!membershipToDelete) {
      throw new NotFoundException('User is not a member of this group');
    }

    const isCreator = group.creatorId === userId;

    // If the user is the creator, handle adminship transfer
    if (isCreator) {
      // Find the next eligible member to pass adminship to
      const nextAdmin = group.members.find(
        (member) => member.userId !== userId,
      );

      if (nextAdmin) {
        // Pass adminship to the next member if found
        await this.prisma.groupMembership.update({
          where: { groupId_userId: { groupId, userId: nextAdmin.userId } },
          data: { role: GroupRole.ADMIN },
        });
      } else {
        // If no other members, delete the group
        await this.prisma.group.update({
          where: { id: groupId },
          data: { isDeleted: true },
        });
        return { message: 'Group deleted as the last member left' };
      }
    }

    // Soft delete the user's membership.
    await this.prisma.groupMembership.update({
      where: { groupId_userId: { groupId, userId } },
      data: { isDeleted: true },
    });

    return { message: 'Successfully left the group' };
  }
}
