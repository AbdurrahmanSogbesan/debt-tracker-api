import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvitationStatus, Prisma } from '@prisma/client';
import { InvitationService } from 'src/invitation/invitation.service';
import { GroupService } from 'src/group/group.service';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private invitationService: InvitationService,
    private groupService: GroupService,
  ) {}

  async create(data: Prisma.UserCreateInput & { invitationId?: number }) {
    try {
      const { invitationId, ...userCreateData } = data;

      const existingUser = await this.prisma.user.findUnique({
        where: { email: userCreateData.email },
      });

      if (existingUser) {
        throw new ForbiddenException('User with this email already exists.');
      }

      return this.prisma.$transaction(
        async (prisma) => {
          // Create the user
          const user = await prisma.user.create({
            data: userCreateData,
          });

          // If invitation ID is provided, validate and update
          if (invitationId) {
            const existingInvitation = await prisma.invitation.findUnique({
              where: {
                id: invitationId,
                email: userCreateData.email,
                status: InvitationStatus.PENDING,
                isExpired: false,
              },
            });

            if (!existingInvitation) {
              throw new BadRequestException('Invalid or expired invitation.');
            }

            // Update invitation to mark as accepted and link to user
            await prisma.invitation.update({
              where: { id: invitationId },
              data: {
                user: { connect: { id: user.id } },
                status: InvitationStatus.ACCEPTED,
              },
            });
          }

          return user;
        },
        { maxWait: 10000, timeout: 10000 },
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ForbiddenException('Credentials taken!');
      }
      throw err;
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
            group: {
              include: {
                members: {
                  where: {
                    isDeleted: false,
                  },
                  select: {
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
            },
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
      // !NOTE: include must be same here as findAuthUser
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
                  select: {
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
            },
          },
        },
        notifications: true,
      },
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

  async getUserInvitations(supabaseUid: string) {
    const user = await this.groupService.getUserIdFromSupabaseUid(supabaseUid);

    return await this.prisma.invitation.findMany({
      where: { userId: user },
    });
  }
}
