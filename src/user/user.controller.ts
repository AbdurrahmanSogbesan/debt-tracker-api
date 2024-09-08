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
import { JwtGuard } from '../auth/guard';

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

  @Get(':email')
  async findOne(@Param('email') email: string) {
    return await this.userService.findOne(email);
  }

  @Get('me')
  async findAuthUser(@Request() req) {
    console.log('HERE');

    console.log(req.user);
    const { id: supabaseUid } = req.user;

    console.log(supabaseUid);

    return await this.userService.findAuthUser(supabaseUid);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: Prisma.UserUpdateInput,
  ) {
    // return this.userService.update(+id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userService.remove(+id);
  }
}
