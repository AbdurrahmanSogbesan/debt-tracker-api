import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategy';

@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
