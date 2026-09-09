import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import { JwtGuard, RegisteredUserGuard } from '../auth/guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@UseGuards(JwtGuard)
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // The only route reachable before the user row exists, so no RegisteredUserGuard.
  @Post()
  async create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return await this.userService.create({
      ...createUserDto,
      // Trusted claims last: the body must never be able to override identity.
      email: user.email,
      supabaseUid: user.supabaseUid,
    });
  }

  @UseGuards(RegisteredUserGuard)
  @Get('me')
  async findAuthUser(@CurrentUser() user: AuthUser) {
    return await this.userService.findAuthUser(user.supabaseUid);
  }

  @UseGuards(RegisteredUserGuard)
  @Get('stats')
  async getStats(@CurrentUser() user: AuthUser) {
    return await this.userService.getUserStats(user.userId);
  }

  @UseGuards(RegisteredUserGuard)
  @Get('invitations')
  async getUserInvitations(@CurrentUser() user: AuthUser) {
    return await this.userService.getUserInvitations(user.userId);
  }

  @UseGuards(RegisteredUserGuard)
  @Get(':email')
  async findOne(@Param('email') email: string) {
    return await this.userService.findOne(email);
  }

  @UseGuards(RegisteredUserGuard)
  @Patch('me')
  async update(@Body() data: UpdateUserDto, @CurrentUser() user: AuthUser) {
    return await this.userService.update(user.supabaseUid, data);
  }

  @UseGuards(RegisteredUserGuard)
  @Patch('delete')
  async delete(@CurrentUser() user: AuthUser) {
    return await this.userService.delete(user.supabaseUid);
  }
}
