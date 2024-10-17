import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.UserCreateInput) {
    try {
      return await this.prisma.user.create({ data });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ForbiddenException('Credentials taken!');
      }
      throw new Error(err);
    }
  }

  async findAuthUser(supabaseUid: string) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseUid },
      include: {
        memberships: {
          where: {
            isDeleted: false,
          },
          include: {
            group: true,
          },
        },
        notifications: true,
      },
    });

    if (!user || user.isDeleted) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findOne(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || user.isDeleted) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async update(supabaseUid: string, data: Prisma.UserUpdateInput) {
    const user = await this.prisma.user.update({
      where: { supabaseUid },
      data,
    });
    return user;
  }

  async delete(supabaseUid: string) {
    const user = await this.prisma.user.update({
      where: { supabaseUid },
      data: {
        isDeleted: true,
      },
    });
    return user;
  }
}
