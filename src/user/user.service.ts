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
      console.log('HERE IS THE ERROR -->', err);
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
    console.log(supabaseUid);

    const user = await this.prisma.user.findUnique({
      where: { supabaseUid },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findOne(email: string) {
    return await this.prisma.user.findUniqueOrThrow({
      where: { email },
    });
  }

  update(id: number) {
    return `This action updates a #${id} user`;
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }
}
