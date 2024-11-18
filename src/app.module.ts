import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { GroupModule } from './group/group.module';
import { MembershipModule } from './membership/membership.module';
import { TransactionModule } from './transaction/transaction.module';
import { LoanModule } from './loan/loan.module';
import { MailModule } from './mail/mail.module';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { MailerModule } from '@nestjs-modules/mailer';
import * as path from 'path';

@Module({
  imports: [
    PrismaModule,
    ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true }),
    AuthModule,
    UserModule,
    GroupModule,
    MembershipModule,
    TransactionModule,
    LoanModule,
    MailModule,
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        transport: {
          host: config.get('MAIL_HOST'),
          port: config.get('MAIL_PORT') || 465,
          auth: {
            user: config.get('POSTMARK_API_TOKEN'),
            pass: config.get('POSTMARK_API_TOKEN'),
          },
          tls: {
            rejectUnauthorized: false,
          },
          name: config.get('MAIL_NAME'),
        },
        defaults: {
          from: `"No Reply" <${config.get('MAIL_FROM')}>`,
        },
        template: {
          dir: path.join(process.env.PWD, '/src/templates/layouts'),
          adapter: new HandlebarsAdapter(undefined, {
            inlineCssEnabled: true,
            // inlineCssOptions: { baseUrl: ' ' },
          }),
          options: {
            strict: true,
          },
        },
        options: {
          partials: {
            dir: path.join(process.env.PWD, '/src/templates/partials'),
            options: {
              strict: true,
            },
          },
        },
        preview: false,
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
