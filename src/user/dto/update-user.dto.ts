import { OmitType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

// invitationId is dropped: accepting an invitation is its own endpoint.
export class UpdateUserDto extends OmitType(CreateUserDto, [
  'invitationId',
] as const) {}
