import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GroupRole, InvitationStatus, Prisma } from '@prisma/client';
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

      return this.prisma.$transaction(
        async (prisma) => {
          // Create the user
          const user = await prisma.user.create({
            data: userCreateData,
          });

          // Handle invitation logic, if present
          if (invitationId) {
            const existingInvitation = await prisma.invitation.findUnique({
              where: {
                id: invitationId,
                email: userCreateData.email,
                status: InvitationStatus.PENDING,
                isExpired: false,
              },
              include: { group: true },
            });

            if (!existingInvitation || existingInvitation.isExpired) {
              throw new BadRequestException('Invalid or expired invitation.');
            }

            // Mark the invitation as accepted
            await prisma.invitation.update({
              where: { id: invitationId },
              data: {
                user: { connect: { id: user.id } },
                status: InvitationStatus.ACCEPTED,
              },
            });

            // Add the user to the group automatically
            await prisma.groupMembership.create({
              data: {
                groupId: existingInvitation.groupId,
                userId: user.id,
                role: GroupRole.MEMBER,
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
