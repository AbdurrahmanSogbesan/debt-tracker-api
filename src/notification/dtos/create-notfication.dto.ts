import { NotificationType, Prisma } from '@prisma/client';
import {
  IsArray,
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  IsObject,
} from 'class-validator';

export class CreateNotificationDto {
  @IsArray()
  @IsInt({ each: true })
  userIds: number[];

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsString()
  message: string;

  @IsOptional()
  @IsObject()
  payload?: Prisma.JsonValue;

  @IsOptional()
  @IsInt()
  groupId?: number;

  @IsOptional()
  @IsInt()
  loanId?: number;

  @IsOptional()
  @IsInt()
  inviteId?: number;
}
