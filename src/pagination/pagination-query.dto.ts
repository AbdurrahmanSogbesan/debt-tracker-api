import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const MAX_PAGE_SIZE = 100;

// Every paginated query extends this, so a new endpoint inherits the ceiling
// instead of having to remember it. Without a cap, ?pageSize=1000000 is a
// well-formed request that materializes the table.
export class PaginationQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  @Type(() => Number)
  pageSize: number = 10;
}
