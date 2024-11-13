import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendEmailDto } from './dto/send-email.dto';
import { MailerService } from '@nestjs-modules/mailer';
import { join } from 'path';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    try {
      this.logger.log('Connected to email server');
    } catch (error) {
      this.logger.warn(
        'Unable to connect to email server. Check your SMTP configuration.',
      );
      console.log(error);
    }
  }

  async sendEmail(options: SendEmailDto) {
    try {
      const fromEmail = this.configService.get<string>('MAIL_FROM');
      const fromName = this.configService.get<string>('MAIL_NAME');

      // Base mail options
      const mailOptions: any = {
        to: options.recipients,
        from: `${fromName} <${fromEmail}>`,
        subject: options.subject,
      };

      // Add template configuration if provided, otherwise use text/html body
      if (options.template) {
        mailOptions.template = options.template;
        mailOptions.context = options.context || {};
      } else {
        mailOptions.text = options.textBody;
        mailOptions.html = options.htmlBody;
      }

      // Add attachments if provided
      if (options.attachments?.length) {
        mailOptions.attachments = options.attachments;
      }

      const result = await this.mailerService.sendMail(mailOptions);
      this.logger.log('Email sent successfully');
      return result;
    } catch (error) {
      this.logger.error('Failed to send email', error.stack);
      throw error;
    }
  }
}
