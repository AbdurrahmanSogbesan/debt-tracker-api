import { Controller, Get, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UseGuards } from '@nestjs/common';
import { JwtGuard } from './guard/index';

// Protects all routes in this controller
@UseGuards(JwtGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  create(@Request() req) {
    return {
      message: 'This is a protected route',
      user: req.user,
    };
  }
}
