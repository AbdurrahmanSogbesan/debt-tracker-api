import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UserService } from './user.service';
import { JwtGuard } from '../auth/guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { GroupService } from 'src/group/group.service';

@UseGuards(JwtGuard)
@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly groupService: GroupService,
  ) {}

  @Post()
  async create(@Body() createUserDto: CreateUserDto, @Request() req) {
    const { email, id: supabaseUid } = req.user;
    return await this.userService.create({
      ...createUserDto,
      // Trusted claims last: the body must never be able to override identity.
      email,
      supabaseUid,
    });
  }

  @Get('me')
  async findAuthUser(@Request() req) {
    const { id: supabaseUid } = req.user;
    return await this.userService.findAuthUser(supabaseUid);
  }

  @Get('stats')
  async getStats(@Request() req) {
    const { id: supabaseUid } = req.user;

    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);
    return await this.userService.getUserStats(userId);
  }

  @Get('invitations')
  async getUserInvitations(@Request() req) {
    const { id: supabaseUid } = req.user;
    return await this.userService.getUserInvitations(supabaseUid);
  }

  @Get(':email')
  async findOne(@Param('email') email: string) {
    return await this.userService.findOne(email);
  }

  @Patch('me')
  async update(@Body() data: UpdateUserDto, @Request() req) {
    const { id: supabaseUid } = req.user;
    return await this.userService.update(supabaseUid, data);
  }

  @Patch('delete')
  async delete(@Request() req) {
    const { id: supabaseUid } = req.user;
    return await this.userService.delete(supabaseUid);
  }
}
