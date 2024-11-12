import {
  IsEmail,
  IsString,
  IsOptional,
  IsObject,
  IsArray,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class SendEmailDto {
  @IsEmail({}, { each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  recipients: string | string[];

  @IsString()
  @IsOptional()
  from?: string;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  textBody?: string;

  @IsString()
  @IsOptional()
  htmlBody?: string;

  @IsString()
  @IsOptional()
  template?: string;

  @IsObject()
  @IsOptional()
  context?: Record<string, any>;

  @IsArray()
  @IsOptional()
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: string | Buffer;
    contentType?: string;
  }>;
}
