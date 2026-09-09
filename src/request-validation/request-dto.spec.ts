import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { UpdateUserDto } from '../user/dto/update-user.dto';
import { CreateGroupDto } from '../group/dto/create-group.dto';
import { CreateLoanDto } from '../loan/dto/create-individual-loan.dto';
import { CreateSplitLoanRequest } from '../loan/dto/create-split-loan.dto';
import { UpdateIndividualLoanDto } from '../loan/dto/update-individual-loan.dto';
import { UpdateSplitLoanRequest } from '../loan/dto/update-split-loan.dto';
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

  // A negative amount inverted who owed whom and corrupted every _sum aggregate.
  // POST /loan accepted amount: -5000 with a 201 until these DTOs existed.
  describe('rejects non-positive money on every path', () => {
    const loan = (amount: unknown) => ({
      amount,
      description: 'x',
      direction: 'OUT',
      otherPartyEmail: 'b@example.com',
    });
    const split = (amount: unknown) => ({
      groupId: 1,
      description: 'x',
      memberSplits: [{ email: 'b@example.com', amount }],
    });

    it.each([[-5000], [0], [-0.01]])(
      'POST /loan rejects %p',
      async (amount) => {
        await expect(accepts(CreateLoanDto, loan(amount))).rejects.toThrow();
      },
    );

    it.each([[-30], [0]])('POST /loan/splits rejects %p', async (amount) => {
      await expect(
        accepts(CreateSplitLoanRequest, split(amount)),
      ).rejects.toThrow();
    });

    it('PATCH /loan/:id rejects a negative amount', async () => {
      await expect(
        accepts(UpdateIndividualLoanDto, { amount: -5000 }),
      ).rejects.toThrow();
    });

    it('PATCH /loan/:id/splits rejects a negative split', async () => {
      await expect(
        accepts(UpdateSplitLoanRequest, {
          memberSplits: [{ email: 'b@example.com', amount: -9 }],
        }),
      ).rejects.toThrow();
    });

    it.each([['abc'], [1.005], [1e12]])(
      'rejects malformed amount %p',
      async (amount) => {
        await expect(accepts(CreateLoanDto, loan(amount))).rejects.toThrow();
      },
    );

    it('still accepts a valid loan', async () => {
      await expect(accepts(CreateLoanDto, loan(100.5))).resolves.toMatchObject({
        amount: 100.5,
      });
    });

    it('still accepts a backdated due date', async () => {
      await expect(
        accepts(CreateLoanDto, {
          ...loan(12),
          dueDate: '2020-01-01T00:00:00.000Z',
        }),
      ).resolves.toMatchObject({ amount: 12 });
    });
  });
});
