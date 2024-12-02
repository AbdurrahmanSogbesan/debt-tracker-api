import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { InvitationService } from './invitation.service';
import { GroupService } from 'src/group/group.service';
import { JwtGuard } from 'src/auth/guard';
import { CreateInvitationDto } from './dtos/create-invitation.dto';

@UseGuards(JwtGuard)
@Controller('invitation')
export class InvitationController {
  constructor(
    private readonly invitationService: InvitationService,
    private readonly groupService: GroupService,
  ) {}

  @Post()
  async createInvitation(@Body() data: CreateInvitationDto, @Request() req) {
    const { id: supabaseUid } = req.user || {};

    const inviterId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);

    const invitation = await this.invitationService.createInvitation(
      data.groupId,
      data.email,
      inviterId,
    );

    return {
      message: 'Invitation created successfully',
      invitation,
    };
  }

  @Get(':invitationId')
  async getInvitationById(
    @Param('invitationId') invitationId: number,
    @Request() req,
  ) {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);

    return await this.invitationService.getInvitationById(
      +invitationId,
      userId,
    );
  }

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
