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
import { GroupService } from './group.service';
import { JwtGuard } from '../auth/guard';
import { Prisma } from '@prisma/client';

@UseGuards(JwtGuard)
@Controller('group')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}
  @Post()
  async create(@Body() data: Prisma.GroupCreateInput, @Request() req) {
    const { id: supabaseUid } = req.user || {};

    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);

    return await this.groupService.create({
      ...data,
      creator: {
        connect: { id: userId },
      },
    });
  }
  // Refactor when group membership done.
  // @Get('my-groups')
  // async findMyGroups(@Request() req) {
  //   const { id: supabaseUid } = req.user || {};
  //   const userId =
  //     await this.groupService.getUserIdFromSupabaseUid(supabaseUid);
  //   return this.groupService.find(userId);
  // }

  @Get(':id')
  async findById(@Param('id') id: number) {
    return await this.groupService.findOne(+id);
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

  @Get(':id/members')
  async getGroupMembers(@Param('id') groupId: number, @Request() req) {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);
    return await this.groupService.getGroupMembers(+groupId, userId);
  }
}
