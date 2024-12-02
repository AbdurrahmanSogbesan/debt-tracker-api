import { IsEmail, IsInt, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateInvitationDto {
  @IsInt()
  @IsNotEmpty()
  @Transform(({ value }) => parseInt(value))
  groupId: number;

  @IsEmail()
  @IsNotEmpty()
  email: string;
}
