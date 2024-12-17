import { IsOptional, IsEnum, IsInt } from 'class-validator';
import { NotificationType } from '@prisma/client';
import { Type } from 'class-transformer';

export class FetchNotificationsDto {
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  groupId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number = 10;

  @IsOptional()
  @Type(() => Boolean)
  isRead?: boolean;
}
