import { IsOptional, IsEnum, IsInt, IsBoolean } from 'class-validator';
import { NotificationType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { PaginationQueryDto } from '../../pagination/pagination-query.dto';

export class FetchNotificationsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  groupId?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  isRead?: boolean;
}
