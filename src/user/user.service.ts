import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
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

  private async getLoanStats(where: any) {
    try {
      const statusCounts = await this.prisma.loan.groupBy({
        by: ['status'],
        where: {
          ...where,
          isDeleted: false,
          parentId: null,
        },
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
    } catch (error) {
      console.error('Error fetching loan stats:', error);
      throw new InternalServerErrorException('Could not fetch loan stats');
    }
  }

  private async notifyGroupAdmins(
    prisma: any,
    invitation: any,
    userId: number,
    userCreateData: Prisma.UserCreateInput,
  ) {
    const groupAdmins = invitation.group.members.filter(
      (member) => member.role === GroupRole.ADMIN,
    );

    const adminIds = groupAdmins.map((admin) => admin.userId);

    if (adminIds.length > 0) {
      const userName =
        `${userCreateData.firstName} ${userCreateData.lastName}`.trim();

      // Create the notification directly with the transaction's prisma instance
      await prisma.notification.create({
        data: {
          type: NotificationType.INVITATION_ACCEPTED,
          message: `${userName} has accepted the invitation to join the group "${invitation.group.name}".`,
          payload: {
            groupId: invitation.groupId,
            groupName: invitation.group.name,
            userId: userId,
          },
          users: {
            connect: adminIds.map((id) => ({ id })),
          },
          group: { connect: { id: invitation.groupId } },
          invite: { connect: { id: invitation.id } },
        },
      });
    }
  }

  private async processInvitation(
    prisma: any,
    user: any,
    invitationId: number,
    userCreateData: Prisma.UserCreateInput,
  ) {
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

    // Add the user as a new member of the group
    await prisma.groupMembership.create({
      data: {
        groupId: invitation.groupId,
        userId: user.id,
        role: GroupRole.MEMBER,
      },
    });

    // Notify group admins
    await this.notifyGroupAdmins(prisma, invitation, user.id, userCreateData);
  }

  private async createLoanNotification(
    prisma: any,
    recipientId: number,
    loanId: number,
    amount: number,
    userCreateData: Prisma.UserCreateInput,
  ) {
    await prisma.notification.create({
      data: {
        type: NotificationType.LOAN_CREATED,
        message: `${userCreateData.firstName} ${userCreateData.lastName} has joined and is now linked to your loan.`,
        payload: { loanId, amount },
        users: {
          connect: [{ id: recipientId }],
        },
        loan: { connect: { id: loanId } },
      },
    });
  }

  private async processBorrowerLoan(
    prisma: any,
    loan: any,
    user: any,
    userCreateData: Prisma.UserCreateInput,
  ) {
    await prisma.loan.update({
      where: { id: loan.id },
      data: {
        borrower: { connect: { id: user.id } },
        borrowerEmail: null,
        isAcknowledged: !!loan.lenderId,
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
      await this.createLoanNotification(
        prisma,
        loan.lenderId,
        loan.id,
        loan.amount,
        userCreateData,
      );
    }
  }

  private async processLenderLoan(
    prisma: any,
    loan: any,
    user: any,
    userCreateData: Prisma.UserCreateInput,
  ) {
    await prisma.loan.update({
      where: { id: loan.id },
      data: {
        lender: { connect: { id: user.id } },
        lenderEmail: null,
        isAcknowledged: !!loan.borrowerId,
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
      await this.createLoanNotification(
        prisma,
        loan.borrowerId,
        loan.id,
        loan.amount,
        userCreateData,
      );
    }
  }

  private async syncUserLoans(
    prisma: any,
    user: any,
    userCreateData: Prisma.UserCreateInput,
  ) {
    // Find loans where this user is a borrower
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

    // Find loans where this user is a lender
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

    // Process both types of loans
    await Promise.all([
      ...pendingBorrowerLoans.map((loan) =>
        this.processBorrowerLoan(prisma, loan, user, userCreateData),
      ),
      ...pendingLenderLoans.map((loan) =>
        this.processLenderLoan(prisma, loan, user, userCreateData),
      ),
    ]);
  }

  async create(
    data: Prisma.UserCreateInput & {
      invitationId?: number;
    },
  ) {
    try {
      const { invitationId, ...userCreateData } = data;

      return await this.prisma.$transaction(async (prisma) => {
        // Create the user
        const user = await prisma.user.create({
          data: userCreateData,
        });

        // Handle invitation if provided
        if (invitationId) {
          await this.processInvitation(
            prisma,
            user,
            invitationId,
            userCreateData,
          );
        }

        await this.syncUserLoans(prisma, user, userCreateData);

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
