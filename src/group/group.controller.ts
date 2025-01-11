import {
  Controller,
  Post,
  Body,
  Request,
  UseGuards,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { GroupService } from './group.service';
import { JwtGuard } from '../auth/guard';
import { Prisma } from '@prisma/client';
import { GetGroupMembersDto } from './dto/get-group-members.dto';

@UseGuards(JwtGuard)
@Controller('group')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}
  @Post()
  async create(
    @Body()
    data: Omit<Prisma.GroupCreateInput, 'creator'> & {
      members?: string[];
    },
    @Request() req,
  ) {
    const { id: supabaseUid } = req.user || {};
    const { members, ...groupData } = data;

    const [creatorId, memberIds] = await Promise.all([
      this.groupService.getUserIdFromSupabaseUid(supabaseUid),
      this.groupService.getUserIdsByEmails(members || []),
    ]);

    return await this.groupService.create({
      ...groupData,
      creatorId,
      memberIds,
    });
  }
  @Get('my-groups')
  async findMyGroups(@Request() req) {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);
    return this.groupService.find(userId);
  }

  @Get(':id')
  async findById(@Param('id') id: number) {
    return await this.groupService.findOne(+id);
  }

  @Get(':id/members')
  async getGroupMembers(
    @Param('id') groupId: number,
    @Query() query: GetGroupMembersDto,
  ) {
    return await this.groupService.getGroupMembers(+groupId, query);
  }

  @Patch(':id')
  async update(
    @Body() data: Prisma.GroupUpdateInput,
    @Param('id') id: number,
    @Request() req,
  ) {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);
    return await this.groupService.update(+id, data, userId);
  }

  @Patch(':id/delete')
  async delete(@Param('id') id: number, @Request() req) {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);
    return await this.groupService.delete(+id, userId);
  }
}
