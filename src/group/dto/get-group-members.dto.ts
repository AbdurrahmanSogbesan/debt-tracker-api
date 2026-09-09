import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../pagination/pagination-query.dto';

export class GetGroupMembersDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}
