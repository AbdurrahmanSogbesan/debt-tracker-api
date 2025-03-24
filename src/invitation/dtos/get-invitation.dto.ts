import { IsEmail, IsNotEmpty, IsNumberString, IsString } from 'class-validator';

export class GetInvitationQueryDto {
  @IsNotEmpty()
  @IsNumberString()
  groupId: string;
}
