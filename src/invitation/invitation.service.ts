import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GroupRole, InvitationStatus, NotificationType } from '@prisma/client';
import { MailService } from 'src/mail/mail.service';
import { MembershipService } from 'src/membership/membership.service';
import { NotificationService } from 'src/notification/notification.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserService } from 'src/user/user.service';

@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    @Inject(forwardRef(() => MembershipService))
    private membershipService: MembershipService,
    @Inject(forwardRef(() => UserService))
    private userService: UserService,
    private notificationService: NotificationService,
  ) {}

  private async getUserFirstName(id: number): Promise<string | undefined> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { firstName: true },
    });
    return user?.firstName;
  }

  async createInvitation(groupId: number, email: string, inviterId: number) {
    const [group, isAdmin] = await Promise.all([
      this.membershipService.getGroupWithMembers(
        groupId,
        {},
        { members: { where: { isDeleted: false } } },
      ),
      this.membershipService.isGroupMemberAdmin(groupId, inviterId),
    ]);

    // Find inviter and validate permissions
    const inviter = group.members.find((member) => member.userId === inviterId);
    if (!inviter) {
      throw new ForbiddenException('You are not a member of this group');
    }

    if (!isAdmin) {
      throw new ForbiddenException('Only admins can send invites!');
    }

    const [existingUser, existingInvitation] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.prisma.invitation.findFirst({
        where: {
          groupId,
          email,
          status: InvitationStatus.PENDING,
          isExpired: false,
        },
      }),
    ]);

    if (existingUser) {
      const isGroupMember = group.members.find(
        (member) => member.userId === existingUser.id,
      );

      if (isGroupMember) {
        throw new ForbiddenException('User is already a member of this group');
      }
    }

    if (existingInvitation) {
      throw new BadRequestException(
        'An active invitation for this email already exists',
      );
    }

    // Create invitation and notification in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const newInvitation = await tx.invitation.create({
        data: {
          groupId,
          email,
          userId: existingUser?.id || null,
        },
      });

      let notification = null;
      if (existingUser) {
        const inviterName = await this.getUserFirstName(inviterId);
        notification = await tx.notification.create({
          data: {
            type: NotificationType.INVITATION_RECEIVED,
            message: `${inviterName} has invited you to join "${group.name}". Tap to view the invitation.`,
            payload: {
              groupId,
              groupName: group.name,
              inviterId,
              invitationId: newInvitation.id,
            },
            users: {
              connect: [{ id: existingUser.id }],
            },
            group: { connect: { id: groupId } },
            invite: { connect: { id: newInvitation.id } },
          },
        });
      }

      return { invitation: newInvitation, notification };
    });

    const invitationLink = existingUser
      ? `${process.env.FRONTEND_URL}/login?invitationId=${result.invitation.id}?groupId=${groupId}`
      : `${process.env.FRONTEND_URL}/signup?invitationId=${result.invitation.id}?groupId=${groupId}`;

    try {
      const emailSubject = `You are Invited to Join Our Group: ${group.name}`;
      let emailBody = '';

      if (existingUser) {
        emailBody = `
        Hi,
        
        You've been invited to join the group "${group.name}". 
        
        Log in to your account to view and accept this invitation:
        ${invitationLink}
        
        An invitation notification will be waiting for you after you log in.
      `;
      } else {
        emailBody = `
        Hi,
        
        You've been invited to join the group "${group.name}".
        
        Follow this link to create an account and accept the invitation:
        ${invitationLink}
      `;
      }

      await this.mailService.sendEmail({
        recipients: email,
        subject: emailSubject,
        textBody: emailBody,
        htmlBody: emailBody.replace(/\n/g, '<br>'),
      });
    } catch (emailError) {
      this.logger.error('Failed to send invitation email', {
        email,
        invitationId: result.invitation.id,
        error: emailError.message,
        userExists: !!existingUser,
      });

      // Get admin IDs and create notification only if there are admins
      const adminIds = group.members
        .filter((member) => member.role === GroupRole.ADMIN)
        .map((admin) => admin.userId);

      if (adminIds.length > 0) {
        await this.notificationService.createNotification({
          type: NotificationType.ADMIN_ALERT,
          message: `Failed to send invitation email to ${email}. Please check logs.`,
          userIds: adminIds,
          payload: {
            email,
            invitationId: result.invitation.id,
            error: emailError.message,
          },
        });
      }
    }

    return result.invitation;
  }

  async acceptInvitation(invitationId: number, userId: number) {
    // Fetch the invitation
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: {
        group: { include: { members: { where: { isDeleted: false } } } },
      },
    });

    if (!invitation || invitation.isExpired || invitation.userId !== userId) {
      throw new BadRequestException('Invalid or expired invitation');
    }

    // Use a transaction to handle membership updates atomically
    const groupMembership = await this.prisma.$transaction(async (prisma) => {
      // Update the invitation status to accepted
      await prisma.invitation.update({
        where: { id: invitationId },
        data: {
          status: InvitationStatus.ACCEPTED,
        },
      });

      // Check if the user is already a member of the group
      const existingMembership = await prisma.groupMembership.findUnique({
        where: {
          groupId_userId: {
            groupId: invitation.groupId,
            userId,
          },
        },
      });

      if (existingMembership) {
        // Reactivate membership if previously deleted
        if (existingMembership.isDeleted) {
          return prisma.groupMembership.update({
            where: {
              groupId_userId: {
                groupId: invitation.groupId,
                userId,
              },
            },
            data: {
              isDeleted: false,
              role: GroupRole.MEMBER, // Default role for reactivated members
            },
          });
        }

        // Throw an error if already an active member
        throw new BadRequestException(
          'User is already an active member of the group',
        );
      }

      // Add the user as a new member of the group
      return await prisma.groupMembership.create({
        data: {
          groupId: invitation.groupId,
          userId,
          role: GroupRole.MEMBER, // Default role for new members
        },
      });
    });

    // Send notifications to group admins
    const groupAdmins = invitation.group.members.filter(
      (member) => member.role === GroupRole.ADMIN,
    );

    const adminIds = groupAdmins.map((admin) => admin.userId);

    if (adminIds.length > 0) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      const userName = `${user?.firstName} ${user?.lastName}`.trim();

      await this.notificationService.createNotification({
        type: NotificationType.INVITATION_ACCEPTED,
        message: `${userName} has accepted the invitation to join the group ${invitation.group.name}.`,
        userIds: adminIds,
        payload: {
          groupId: invitation.groupId,
          groupName: invitation.group.name,
          userId,
        },
        groupId: invitation.groupId,
        inviteId: invitation.id,
      });
    }

    return groupMembership;
  }

  async declineInvitation(invitationId: number, userId: number) {
    const invitation = await this.prisma.invitation.findUnique({
      where: {
        id: invitationId,
        userId,
        isExpired: false,
        isDeleted: false,
      },
    });
    if (!invitation) {
      throw new BadRequestException('Invalid invitation.');
    }
    return this.prisma.invitation.update({
      where: { id: invitationId },
      data: {
        status: InvitationStatus.DECLINED,
      },
    });
  }

  async getInvitationById(invitationId: number, groupId: number) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId, groupId, isDeleted: false },
      include: { group: true },
    });
    if (!invitation) {
      throw new BadRequestException('Invalid invitation.');
    }
    if (invitation.isExpired) {
      throw new BadRequestException('This invitation is expired.');
    }
    return invitation;
  }

  async getPendingInvitations(userId: number) {
    const invitation = this.prisma.invitation.findMany({
      where: {
        userId,
        status: InvitationStatus.PENDING,
        isExpired: false,
        isDeleted: false,
      },
    });

    if (!invitation) {
      throw new NotFoundException('No pending invitations found.');
    }
    return invitation;
  }
}
