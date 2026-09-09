import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateGroupDto } from './create-group.dto';

// members is dropped: the membership endpoints enforce role and admin invariants.
export class UpdateGroupDto extends PartialType(
  OmitType(CreateGroupDto, ['members'] as const),
) {}
