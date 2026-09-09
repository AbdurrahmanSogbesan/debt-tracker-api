import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../auth-user';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.getOrThrow<string>('SUPABASE_JWT_SECRET'),
    });
  }

  async validate(payload: any): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { supabaseUid: payload.sub },
      select: { id: true, email: true, isDeleted: true },
    });

    // Absent or deleted resolves to a null userId rather than throwing, so
    // POST /user can still run. RegisteredUserGuard rejects it everywhere else.
    return {
      supabaseUid: payload.sub,
      email: user && !user.isDeleted ? user.email : payload.email,
      userId: user && !user.isDeleted ? user.id : null,
    };
  }
}
