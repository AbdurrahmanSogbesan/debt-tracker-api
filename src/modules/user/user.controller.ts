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
import { Prisma } from '@prisma/client';
import { JwtGuard } from '../../auth/guard';

@UseGuards(JwtGuard)
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  async create(@Body() createUserDto: Prisma.UserCreateInput, @Request() req) {
    const { email, id: supabaseUid } = req.user || {};
    return await this.userService.create({
      email,
      supabaseUid,
      ...createUserDto,
    });
  }

  @Get('me')
  async findAuthUser(@Request() req) {
    const { id: supabaseUid } = req.user;
    return await this.userService.findAuthUser(supabaseUid);
  }

  @Get(':email')
  async findOne(@Param('email') email: string) {
    return await this.userService.findOne(email);
  }

  @Patch('me')
  async update(@Body() data: Prisma.UserUpdateInput, @Request() req) {
    const { id: supabaseUid } = req.user;
    return await this.userService.update(supabaseUid, data);
  }

  @Patch('delete')
  async delete(@Request() req) {
    const { id: supabaseUid } = req.user;
    return await this.userService.delete(supabaseUid);
  }
}
