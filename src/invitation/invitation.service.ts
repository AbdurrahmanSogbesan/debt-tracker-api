import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GroupRole, InvitationStatus } from '@prisma/client';
import { MailService } from 'src/mail/mail.service';
import { MembershipService } from 'src/membership/membership.service';
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
  ) {}

  async createInvitation(groupId: number, email: string, inviterId: number) {
    // Ensure the inviter is an active member of the group
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
    // Check if user is an existing user
    const isExistingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    // Check for existing group member
    const isGroupMember = group.members.find(
      (member) => member.userId === isExistingUser?.id,
    );
    if (isGroupMember) {
      throw new ForbiddenException('User is already a member of this group');
    }
    // Check for existing active invitations
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

    // Use a Prisma transaction for atomicity
    return await this.prisma.$transaction(async (prisma) => {
      // Create the invitation
      const invitation = await prisma.invitation.create({
        data: {
          groupId,
          email,
          userId: isExistingUser ? isExistingUser?.id : null,
        },
      });

      // Send invitation email
      await this.mailService.sendEmail({
        recipients: email,
        subject: `You are Invited to Join Our Group; ${group.name}`,
        textBody: `Hi, you've been invited to join the group. Follow the link to accept the invitation.`,
        htmlBody: `<p>Hi, you've been invited to join the group. Follow the link to accept the invitation.</p>`,
      });
      return invitation;
    });
  }

  async acceptInvitation(invitationId: number, userId: number) {
    // Fetch the invitation
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId, isExpired: false, isDeleted: false, userId },
    });

    if (!invitation) {
      throw new BadRequestException('Invalid or expired invitation');
    }

    // Use a transaction to ensure both operations succeed together
    return this.prisma.$transaction(async (prisma) => {
      // Update invitation status to accepted
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
        // If the user was previously removed, reactivate their membership
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
              role: GroupRole.MEMBER, // Default role for reactivation
            },
          });
        }
        // If the user is already active, return a conflict response
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
