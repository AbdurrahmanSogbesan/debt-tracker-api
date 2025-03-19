import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { InvitationService } from './invitation.service';
import { GroupService } from 'src/group/group.service';
import { JwtGuard } from 'src/auth/guard';
import { CreateInvitationDto } from './dtos/create-invitation.dto';
import { GetInvitationQueryDto } from './dtos/get-invitation.dto';

@Controller('invitation')
export class InvitationController {
  constructor(
    private readonly invitationService: InvitationService,
    private readonly groupService: GroupService,
  ) {}

  @UseGuards(JwtGuard)
  @Post()
  async createInvitation(@Body() data: CreateInvitationDto, @Request() req) {
    const { id: supabaseUid } = req.user || {};

    const inviterId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);

    return await this.invitationService.createInvitation(
      +data.groupId,
      data.email,
      inviterId,
    );
  }

  @Get(':invitationId')
  async getInvitationById(
    @Param('invitationId') invitationId: number,
    @Query() query: GetInvitationQueryDto,
    @Request() req,
  ) {
    const { groupId, email } = query;

    return await this.invitationService.getInvitationById(
      +invitationId,
      parseInt(groupId),
      email,
    );
  }

  @UseGuards(JwtGuard)
  @Patch(':invitationId/accept')
  async acceptInvitation(
    @Param('invitationId') invitationId: number,
    @Request() req,
  ) {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);
    return await this.invitationService.acceptInvitation(+invitationId, userId);
  }

  @UseGuards(JwtGuard)
  @Patch(':invitationId/decline')
  async declineInvitation(
    @Param('invitationId') invitationId: number,
    @Request() req,
  ) {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);
    return await this.invitationService.declineInvitation(
      +invitationId,
      userId,
    );
  }
}
