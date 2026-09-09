import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../pagination/pagination-query.dto';

export class GetChildLoansDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  searchQuery?: string;
}
