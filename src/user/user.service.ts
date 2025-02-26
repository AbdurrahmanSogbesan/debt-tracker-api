import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  GroupRole,
  InvitationStatus,
  LoanStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { InvitationService } from 'src/invitation/invitation.service';
import { GroupService } from 'src/group/group.service';
import { NotificationService } from 'src/notification/notification.service';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private invitationService: InvitationService,
    private groupService: GroupService,
    private notificationService: NotificationService,
  ) {}

  async getLoanStats(where: any) {
    const statusCounts = await this.prisma.loan.groupBy({
      by: ['status'],
      where: { ...where, isDeleted: false },
      _count: true,
      _sum: { amount: true },
    });

    const result = {
      totalAmount: 0,
      activeLoans: 0,
      paidLoans: 0,
      totalLoans: 0,
    };

    statusCounts.forEach((stat) => {
      result.totalAmount += Number(stat._sum.amount) || 0;
      result.totalLoans += stat._count;

      if (stat.status === LoanStatus.ACTIVE) {
        result.activeLoans = stat._count;
      } else if (stat.status === LoanStatus.REPAID) {
        result.paidLoans = stat._count;
      }
    });

    return result;
  }

  async create(data: Prisma.UserCreateInput & { invitationId?: number }) {
    try {
      const { invitationId, ...userCreateData } = data;

      return await this.prisma.$transaction(async (prisma) => {
        // Create the user
        const user = await prisma.user.create({
          data: userCreateData,
        });

        if (invitationId) {
          // Fetch the invitation with necessary group information
          const invitation = await prisma.invitation.findFirst({
            where: {
              id: invitationId,
              email: userCreateData.email,
              status: InvitationStatus.PENDING,
              isExpired: false,
              isDeleted: false,
            },
            include: {
              group: {
                include: { members: { where: { isDeleted: false } } },
              },
            },
          });

          if (!invitation) {
            throw new BadRequestException('Invalid or expired invitation.');
          }

          // Mark the invitation as accepted
          await prisma.invitation.update({
            where: { id: invitationId },
            data: {
              status: InvitationStatus.ACCEPTED,
              user: { connect: { id: user.id } },
            },
          });

          // Send notifications to group admins
          const groupAdmins = invitation.group.members.filter(
            (member) => member.role === GroupRole.ADMIN,
          );

          const adminIds = groupAdmins.map((admin) => admin.userId);

          if (adminIds.length > 0) {
            const userName =
              `${userCreateData.firstName} ${userCreateData.lastName}`.trim();

            await this.notificationService.createNotification({
              type: NotificationType.INVITATION_ACCEPTED,
              message: `${userName} has accepted the invitation to join the group "${invitation.group.name}".`,
              userIds: adminIds,
              payload: {
                groupId: invitation.groupId,
                groupName: invitation.group.name,
                userId: user.id,
              },
              groupId: invitation.groupId,
              inviteId: invitation.id,
            });
          }
        }

        return user;
      });
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

  async getUserStats(userId: number) {
    // Get all group IDs the user belongs to
    const groupMemberships = await this.prisma.groupMembership.findMany({
      where: { userId, isDeleted: false },
      select: { groupId: true },
    });
    const groupIds = groupMemberships.map((g) => g.groupId);

    // Get stats for all loans involving the user (as borrower or lender)
    const userLoanStats = await this.getLoanStats({
      OR: [{ borrowerId: userId }, { lenderId: userId }],
    });

    // Get stats for all loans in user's groups (if any)
    const groupLoanStats =
      groupIds.length > 0
        ? await this.getLoanStats({
            groupId: { in: groupIds },
            OR: [{ borrowerId: userId }, { lenderId: userId }],
          })
        : { totalAmount: 0, activeLoans: 0, paidLoans: 0, totalLoans: 0 };

    return {
      totalLoanedOut: userLoanStats.totalAmount,
      totalLoanedIn: userLoanStats.totalAmount,
      activeLoans: userLoanStats.activeLoans,
      paidLoans: userLoanStats.paidLoans,
      groupsBelongedTo: groupIds.length,
      groupLoans: groupLoanStats.totalLoans,
      groupLoanAmount: groupLoanStats.totalAmount,
      activeGroupLoans: groupLoanStats.activeLoans,
      paidGroupLoans: groupLoanStats.paidLoans,
    };
  }
}
