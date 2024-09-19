import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { GroupModule } from './group/group.module';
import { MembershipModule } from './membership/membership.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true }),
    AuthModule,
    UserModule,
    GroupModule,
    MembershipModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
