import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InvitationService } from './invitation.service';
import { JwtGuard, RegisteredUserGuard } from 'src/auth/guard';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { AuthUser } from 'src/auth/auth-user';
import { CreateInvitationDto } from './dtos/create-invitation.dto';
import { GetInvitationQueryDto } from './dtos/get-invitation.dto';

@Controller('invitation')
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  @UseGuards(JwtGuard, RegisteredUserGuard)
  @Post()
  async createInvitation(
    @Body() data: CreateInvitationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return await this.invitationService.createInvitation(
      +data.groupId,
      data.email,
      user.userId,
    );
  }

  @UseGuards(JwtGuard, RegisteredUserGuard)
  @Get('pending')
  async getPendingInvitationsForUser(@CurrentUser() user: AuthUser) {
    return this.invitationService.getPendingInvitationsForUser(user.userId);
  }

  @UseGuards(JwtGuard, RegisteredUserGuard)
  @Get(':groupId/pending')
  async getPendingInvitationsForGroup(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: number,
  ) {
    return this.invitationService.getPendingInvitationsForGroup(
      user.userId,
      +groupId,
    );
  }

  @Get(':invitationId')
  async getInvitationById(
    @Param('invitationId') invitationId: number,
    @Query() query: GetInvitationQueryDto,
  ) {
    const { groupId } = query;

    return await this.invitationService.getInvitationById(
      +invitationId,
      parseInt(groupId),
    );
  }

  @UseGuards(JwtGuard, RegisteredUserGuard)
  @Patch(':invitationId/accept')
  async acceptInvitation(
    @Param('invitationId') invitationId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return await this.invitationService.acceptInvitation(
      +invitationId,
      user.userId,
    );
  }

  @UseGuards(JwtGuard, RegisteredUserGuard)
  @Patch(':invitationId/decline')
  async declineInvitation(
    @Param('invitationId') invitationId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return await this.invitationService.declineInvitation(
      +invitationId,
      user.userId,
    );
  }
}
