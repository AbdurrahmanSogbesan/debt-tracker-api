import { IsOptional, IsString, IsInt, Min } from 'class-validator';

export class GetChildLoansDto {
  @IsOptional()
  @IsString()
  searchQuery?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize: number = 10;
}
