import {
  Controller,
  Post,
  Body,
  Request,
  UseGuards,
  Get,
  Param,
  Patch,
} from '@nestjs/common';
import { JwtGuard } from '../auth/guard';
import { GroupRole, Prisma } from '@prisma/client';
import { MembershipService } from './membership.service';
import { GroupService } from '../group/group.service';

@UseGuards(JwtGuard)
@Controller('membership')
export class MembershipController {
  constructor(
    private readonly membershipService: MembershipService,
    private readonly groupService: GroupService,
  ) {}

  @Get(':groupId/pendingMembers')
  async getPendingMembers(@Param('groupId') groupId: number, @Request() req) {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);

    return await this.membershipService.getPendingGroupMembers(
      +groupId,
      userId,
    );
  }

  @Post(':groupId/member')
  async addMember(
    @Param('groupId') groupId: number,
    @Body('userId') userId: number,
    @Request() req,
  ) {
    const { id: supabaseUid } = req.user || {};
    const addedByUserId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);

    return await this.membershipService.addMember(
      +groupId,
      userId,
      addedByUserId,
    );
  }

  @Post(':groupId/leave')
  async leaveGroup(@Param('groupId') groupId: number, @Request() req) {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);
    return await this.membershipService.leaveGroup(+groupId, userId);
  }

  @Patch(':groupId/remove/member/:userId')
  async removeMember(
    @Param('groupId') groupId: number,
    @Param('userId') userId: number,
    @Request() req,
  ) {
    const { id: supabaseUid } = req.user || {};
    const removedByUserId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);
    return await this.membershipService.removeMember(
      +groupId,
      +userId,
      removedByUserId,
    );
  }

  @Patch(':groupId/update/member/:userId')
  async updateMemberRole(
    @Param('groupId') groupId: number,
    @Param('userId') userId: number,
    @Body('role') role: GroupRole,

    @Request() req,
  ) {
    const { id: supabaseUid } = req.user || {};

    const updatedByUserId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);

    return await this.membershipService.updateMemberRole(
      +groupId,
      +userId,
      updatedByUserId,
      role,
    );
  }
}
