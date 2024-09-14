import { Injectable, NotFoundException } from '@nestjs/common';
import { Group, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class GroupService {
  constructor(private prisma: PrismaService) {}
  async create(data: Prisma.GroupCreateInput): Promise<Group> {
    return this.prisma.group.create({
      data,
      include: {
        creator: true,
      },
    });
  }

  async getUserIdFromSupabaseUid(supabaseUid: string) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseUid },
    });
    if (!user || user.isDeleted) {
      throw new Error('User not found');
    }
    return user.id;
  }

  // Refactor when group membership done.
  // async find(userId: number) {
  //   const groups = await this.prisma.user.aggregate
  // }

  //   if (groups.length === 0) {
  //     throw new NotFoundException(
  //       `No groups found for user with id: ${userId}`,
  //     );
  //   }

  //   return groups;
  // }

  async findOne(id: number) {
    const group = await this.prisma.group.findUnique({
      where: { id },
    });
    if (!group || group.isDeleted) {
      throw new NotFoundException('Group not found');
    }
    return group;
  }

  async update(id: number, data: Prisma.GroupUpdateInput) {
    const group = await this.prisma.group.update({
      where: { id },
      data,
    });
    return group;
  }

  async delete(id: number) {
    const group = await this.prisma.group.update({
      where: { id },
      data: {
        isDeleted: true,
      },
    });
    return group;
  }
}
