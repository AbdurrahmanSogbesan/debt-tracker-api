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
  TransactionCategory,
  TransactionDirection,
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

        // Find and link pending loans where this user is a borrower
        const pendingBorrowerLoans = await prisma.loan.findMany({
          where: {
            borrowerEmail: userCreateData.email,
            borrowerId: null,
            isDeleted: false,
          },
          include: {
            lender: true,
          },
        });

        // Find and link pending loans where this user is a lender
        const pendingLenderLoans = await prisma.loan.findMany({
          where: {
            lenderEmail: userCreateData.email,
            lenderId: null,
            isDeleted: false,
          },
          include: {
            borrower: true,
          },
        });

        // Process borrower loans
        if (pendingBorrowerLoans.length > 0) {
          await Promise.all(
            pendingBorrowerLoans.map(async (loan) => {
              await prisma.loan.update({
                where: { id: loan.id },
                data: {
                  borrower: { connect: { id: user.id } },
                  borrowerEmail: null,
                  isAcknowledged: loan.lenderId ? true : false,
                  // Create the "IN" transaction for the borrower
                  transactions: {
                    create: [
                      {
                        amount: loan.amount,
                        description: loan.description,
                        direction: TransactionDirection.IN,
                        date: new Date(),
                        title: `Loan from ${loan.lender?.firstName || loan.lenderEmail || 'Someone'} to ${userCreateData.firstName}`,
                        category: TransactionCategory.LOAN,
                        payer: { connect: { id: user.id } },
                      },
                    ],
                  },
                },
              });

              // Notify the lender if they're registered
              if (loan.lenderId) {
                await this.notificationService.createNotification({
                  type: NotificationType.LOAN_CREATED,
                  message: `${userCreateData.firstName} ${userCreateData.lastName} has joined and is now linked to your loan.`,
                  userIds: [loan.lenderId],
                  payload: { loanId: loan.id, amount: loan.amount },
                  loanId: loan.id,
                });
              }
            }),
          );
        }

        // Process lender loans
        if (pendingLenderLoans.length > 0) {
          await Promise.all(
            pendingLenderLoans.map(async (loan) => {
              await prisma.loan.update({
                where: { id: loan.id },
                data: {
                  lender: { connect: { id: user.id } },
                  lenderEmail: null,
                  isAcknowledged: loan.borrowerId ? true : false,

                  // Create the "OUT" transaction for the lender
                  transactions: {
                    create: [
                      {
                        amount: loan.amount,
                        description: loan.description,
                        direction: TransactionDirection.OUT,
                        date: new Date(),
                        title: `Loan from ${userCreateData.firstName} to ${loan.borrower?.firstName || loan.borrowerEmail || 'Someone'}`,
                        category: TransactionCategory.LOAN,
                        payer: { connect: { id: user.id } },
                      },
                    ],
                  },
                },
              });

              // Notify the borrower if they're registered
              if (loan.borrowerId) {
                await this.notificationService.createNotification({
                  type: NotificationType.LOAN_CREATED,
                  message: `${userCreateData.firstName} ${userCreateData.lastName} has joined and is now linked to your loan.`,
                  userIds: [loan.borrowerId],
                  payload: { loanId: loan.id, amount: loan.amount },
                  loanId: loan.id,
                });
              }
            }),
          );
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
