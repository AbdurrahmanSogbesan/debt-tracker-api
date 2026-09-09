import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { GroupService } from './group.service';
import { JwtGuard, RegisteredUserGuard } from '../auth/guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { GetGroupMembersDto } from './dto/get-group-members.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

@UseGuards(JwtGuard, RegisteredUserGuard)
@Controller('group')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post()
  async create(@Body() data: CreateGroupDto, @CurrentUser() user: AuthUser) {
    const { members, ...groupData } = data;
    const memberIds = await this.groupService.getUserIdsByEmails(members || []);

    return await this.groupService.create({
      ...groupData,
      creatorId: user.userId,
      memberIds,
    });
  }

  @Get('my-groups')
  async findMyGroups(@CurrentUser() user: AuthUser) {
    return this.groupService.find(user.userId);
  }

  @Get(':id')
  async findById(@Param('id') id: number, @CurrentUser() user: AuthUser) {
    return await this.groupService.findOne(+id, user.userId);
  }

  @Get(':id/members')
  async getGroupMembers(
    @Param('id') groupId: number,
    @CurrentUser() user: AuthUser,
    @Query() query: GetGroupMembersDto,
  ) {
    return await this.groupService.getGroupMembers(
      +groupId,
      user.userId,
      query,
    );
  }

  @Patch(':id')
  async update(
    @Body() data: UpdateGroupDto,
    @Param('id') id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return await this.groupService.update(+id, data, user.userId);
  }

  @Patch(':id/delete')
  async delete(@Param('id') id: number, @CurrentUser() user: AuthUser) {
    return await this.groupService.delete(+id, user.userId);
  }
}
