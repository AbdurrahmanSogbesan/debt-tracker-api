import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
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
    const group = await this.membershipService.getGroupWithMembers(
      groupId,
      {},
      { members: { where: { isDeleted: false } } },
    );

    const inviter = group.members.find((member) => member.userId === inviterId);
    if (!inviter) {
      throw new ForbiddenException('You are not a member of this group');
    }

    const isAdmin = await this.membershipService.isGroupMemberAdmin(
      groupId,
      inviterId,
    );
    if (!isAdmin) {
      throw new ForbiddenException('Only admins can send invites!');
    }

    const isExistingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    const isGroupMember = group.members.find(
      (member) => member.userId === isExistingUser?.id,
    );
    if (isGroupMember) {
      throw new ForbiddenException('User is already a member of this group');
    }

    const existingInvitation = await this.prisma.invitation.findFirst({
      where: {
        groupId,
        email,
        status: InvitationStatus.PENDING,
        isExpired: false,
      },
    });

    if (existingInvitation) {
      throw new BadRequestException(
        'An active invitation for this email already exists',
      );
    }

    // Create invitation and send mail inside transaction
    const invitation = await this.prisma.$transaction(async (prisma) => {
      const newInvitation = await prisma.invitation.create({
        data: {
          groupId,
          email,
          userId: isExistingUser ? isExistingUser.id : null,
        },
      });

      // Send email
      await this.mailService.sendEmail({
        recipients: email,
        subject: `You are Invited to Join Our Group; ${group.name}`,
        textBody: `Hi, you've been invited to join the group. Follow the link to accept the invitation. ${process.env.FRONTEND_URL}`,
        htmlBody: `<p>Hi, you've been invited to join the group. Follow the link to accept the invitation.</p>`,
      });

      return newInvitation;
    });

    // Add notification for existing user outside the transaction
    if (isExistingUser) {
      const inviterName = await this.getUserFirstName(inviterId);
      await this.notificationService.createNotification({
        type: NotificationType.INVITATION_RECEIVED,
        message: `${inviterName} has invited you to join "${group.name}". Tap to view the invitation.`,
        userIds: [isExistingUser.id],
        payload: {
          groupId,
          groupName: group.name,
          inviterId,
          invitationId: invitation.id,
        },
        groupId,
        inviteId: invitation.id,
      });
    }

    return invitation;
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
      return prisma.groupMembership.create({
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

  async getInvitationById(
    invitationId: number,
    groupId: number,
    email: string,
  ) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId, groupId, email, isDeleted: false },
    });
    if (!invitation) {
      throw new BadRequestException('Invalid invitation.');
    }
    if (invitation.isExpired) {
      throw new BadRequestException('This invitation is expired.');
    }
    return invitation;
  }
}
