import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { UpdateUserDto } from '../user/dto/update-user.dto';
import { CreateGroupDto } from '../group/dto/create-group.dto';
import { UpdateGroupDto } from '../group/dto/update-group.dto';

// Regression tests for SEC-03 / SEC-04. These options must match main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
  transform: true,
});

const meta = (metatype: any): ArgumentMetadata => ({
  type: 'body',
  metatype,
  data: '',
});

const accepts = (dto: any, body: unknown) => pipe.transform(body, meta(dto));

describe('request DTO validation', () => {
  describe('rejects the writes SEC-03 allowed', () => {
    it.each([
      [
        'nested membership write (group privilege escalation)',
        UpdateUserDto,
        { memberships: { create: { groupId: 42, role: 'ADMIN' } } },
      ],
      [
        "nested loan write (fabricating another user's debt)",
        UpdateUserDto,
        { lentLoans: { create: { amount: 999999, borrowerId: 7 } } },
      ],
      ['email override', UpdateUserDto, { email: 'victim@example.com' }],
      ['supabaseUid override', UpdateUserDto, { supabaseUid: 'someone-else' }],
      ['isDeleted override', UpdateUserDto, { isDeleted: false }],
      [
        'identity fields on signup',
        CreateUserDto,
        { firstName: 'A', email: 'victim@example.com', supabaseUid: 'x' },
      ],
      [
        'nested group members write',
        UpdateGroupDto,
        { members: { create: { userId: 9, role: 'ADMIN' } } },
      ],
      ['group creator takeover', UpdateGroupDto, { creatorId: 99 }],
    ])('%s', async (_label, dto, body) => {
      await expect(accepts(dto, body)).rejects.toThrow();
    });
  });

  describe('still accepts legitimate requests', () => {
    it('updates a profile', async () => {
      await expect(
        accepts(UpdateUserDto, {
          firstName: 'Ada',
          lastName: 'Lovelace',
          phone: '+1 (555) 123-4567',
        }),
      ).resolves.toEqual({
        firstName: 'Ada',
        lastName: 'Lovelace',
        phone: '+1 (555) 123-4567',
      });
    });

    it('updates notification preferences', async () => {
      await expect(
        accepts(UpdateUserDto, {
          enableEmailNotifications: false,
          expoPushToken: 'ExponentPushToken[abc]',
        }),
      ).resolves.toEqual({
        enableEmailNotifications: false,
        expoPushToken: 'ExponentPushToken[abc]',
      });
    });

    it('signs up while accepting an invitation', async () => {
      await expect(
        accepts(CreateUserDto, { firstName: 'Ada', invitationId: 12 }),
      ).resolves.toEqual({ firstName: 'Ada', invitationId: 12 });
    });

    it('creates a group with member emails', async () => {
      await expect(
        accepts(CreateGroupDto, {
          name: 'Flat 3',
          description: 'rent',
          members: ['a@b.com', 'c@d.com'],
        }),
      ).resolves.toEqual({
        name: 'Flat 3',
        description: 'rent',
        members: ['a@b.com', 'c@d.com'],
      });
    });

    it('renames a group', async () => {
      await expect(
        accepts(UpdateGroupDto, { name: 'Flat 4' }),
      ).resolves.toEqual({
        name: 'Flat 4',
      });
    });
  });

  describe('enforces field constraints', () => {
    it.each([
      ['over-long firstName', UpdateUserDto, { firstName: 'x'.repeat(200) }],
      ['malformed phone', UpdateUserDto, { phone: 'not-a-phone' }],
      ['empty group name', CreateGroupDto, { name: '' }],
      [
        'malformed member email',
        CreateGroupDto,
        { name: 'g', members: ['nope'] },
      ],
    ])('rejects %s', async (_label, dto, body) => {
      await expect(accepts(dto, body)).rejects.toThrow();
    });
  });
});
