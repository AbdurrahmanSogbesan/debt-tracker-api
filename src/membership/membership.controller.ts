import {
  Controller,
  Post,
  Body,
  UseGuards,
  Param,
  Patch,
} from '@nestjs/common';
import { JwtGuard, RegisteredUserGuard } from '../auth/guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { GroupRole } from '@prisma/client';
import { MembershipService } from './membership.service';

@UseGuards(JwtGuard, RegisteredUserGuard)
@Controller('membership')
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Post(':groupId/member')
  async addMember(
    @Param('groupId') groupId: number,
    @Body('userId') userId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return await this.membershipService.addMember(
      +groupId,
      userId,
      user.userId,
    );
  }

  @Post(':groupId/leave')
  async leaveGroup(
    @Param('groupId') groupId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return await this.membershipService.leaveGroup(+groupId, user.userId);
  }

  @Patch(':groupId/remove/member/:userId')
  async removeMember(
    @Param('groupId') groupId: number,
    @Param('userId') userId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return await this.membershipService.removeMember(
      +groupId,
      +userId,
      user.userId,
    );
  }

  @Patch(':groupId/update/member/:userId')
  async updateMemberRole(
    @Param('groupId') groupId: number,
    @Param('userId') userId: number,
    @Body('role') role: GroupRole,

    @CurrentUser() user: AuthUser,
  ) {
    return await this.membershipService.updateMemberRole(
      +groupId,
      +userId,
      user.userId,
      role,
    );
  }
}
