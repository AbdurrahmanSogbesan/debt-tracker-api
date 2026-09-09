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
    @Body('user.userId') userId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return await this.membershipService.addMember(
      +groupId,
      user.userId,
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

  @Patch(':groupId/remove/member/:user.userId')
  async removeMember(
    @Param('groupId') groupId: number,
    @Param('user.userId') userId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return await this.membershipService.removeMember(
      +groupId,
      +user.userId,
      user.userId,
    );
  }

  @Patch(':groupId/update/member/:user.userId')
  async updateMemberRole(
    @Param('groupId') groupId: number,
    @Param('user.userId') userId: number,
    @Body('role') role: GroupRole,

    @CurrentUser() user: AuthUser,
  ) {
    return await this.membershipService.updateMemberRole(
      +groupId,
      +user.userId,
      user.userId,
      role,
    );
  }
}
