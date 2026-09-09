import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ArrayMaxSize,
} from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsEmail({}, { each: true })
  members?: string[];
}
