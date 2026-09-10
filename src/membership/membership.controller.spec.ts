import { Test } from '@nestjs/testing';
import { MembershipController } from './membership.controller';
import { MembershipService } from './membership.service';
import { AuthUser } from '../auth/auth-user';

/**
 * The caller and the target are both user ids, so swapping them type-checks and
 * passes a route test. A bulk rewrite once did exactly that: every handler
 * operated on the caller instead of the member named in the path.
 */
describe('MembershipController', () => {
  const CALLER = 7;
  const TARGET = 42;
  const GROUP = 5;
  const caller: AuthUser = {
    userId: CALLER,
    supabaseUid: 'uid',
    email: 'caller@example.com',
  };

  const service = {
    addMember: jest.fn(),
    removeMember: jest.fn(),
    updateMemberRole: jest.fn(),
    leaveGroup: jest.fn(),
  };
  let controller: MembershipController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      controllers: [MembershipController],
      providers: [{ provide: MembershipService, useValue: service }],
    }).compile();
    controller = mod.get(MembershipController);
  });

  it('adds the member from the body, acting as the caller', async () => {
    await controller.addMember(GROUP, TARGET, caller);
    expect(service.addMember).toHaveBeenCalledWith(GROUP, TARGET, CALLER);
  });

  it('removes the member from the path, acting as the caller', async () => {
    await controller.removeMember(GROUP, TARGET, caller);
    expect(service.removeMember).toHaveBeenCalledWith(GROUP, TARGET, CALLER);
  });

  it('updates the role of the member from the path, acting as the caller', async () => {
    await controller.updateMemberRole(GROUP, TARGET, 'ADMIN' as any, caller);
    expect(service.updateMemberRole).toHaveBeenCalledWith(
      GROUP,
      TARGET,
      CALLER,
      'ADMIN',
    );
  });

  it('leaves the group as the caller', async () => {
    await controller.leaveGroup(GROUP, caller);
    expect(service.leaveGroup).toHaveBeenCalledWith(GROUP, CALLER);
  });
});
