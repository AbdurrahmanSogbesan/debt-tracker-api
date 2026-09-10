import { PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { UserController } from '../user/user.controller';
import { GroupController } from '../group/group.controller';
import { MembershipController } from '../membership/membership.controller';
import { LoanController } from '../loan/loan.controller';
import { InvitationController } from '../invitation/invitation.controller';
import { NotificationController } from '../notification/notification.controller';
import { TransactionController } from '../transaction/transaction.controller';

/**
 * Route strings are invisible to tsc, eslint and every other test here, so a
 * bulk rewrite once turned `:userId` into `:user.userId` and shipped three dead
 * membership endpoints. These assertions cover that blind spot.
 */
const controllers = [
  UserController,
  GroupController,
  MembershipController,
  LoanController,
  InvitationController,
  NotificationController,
  TransactionController,
];

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const handlersOf = (c: any) =>
  Object.getOwnPropertyNames(c.prototype)
    .filter((m) => m !== 'constructor')
    .filter((m) => Reflect.hasMetadata(PATH_METADATA, c.prototype[m]));

const routesOf = (c: any) =>
  handlersOf(c).map((m) => ({
    handler: m,
    path: Reflect.getMetadata(PATH_METADATA, c.prototype[m]) as string,
  }));

describe('route definitions', () => {
  describe.each(controllers.map((c) => [c.name, c] as const))('%s', (_n, c) => {
    it('declares only simple identifiers as path params', () => {
      for (const { handler, path } of routesOf(c)) {
        const params = (path.match(/:[^/]+/g) ?? []).map((p) => p.slice(1));
        for (const p of params) {
          expect({ handler, path, param: p, ok: IDENTIFIER.test(p) }).toEqual({
            handler,
            path,
            param: p,
            ok: true,
          });
        }
      }
    });

    it('binds only simple identifiers in @Param/@Body/@Query', () => {
      for (const handler of handlersOf(c)) {
        const args =
          Reflect.getMetadata(ROUTE_ARGS_METADATA, c, handler) ?? {};
        for (const meta of Object.values<any>(args)) {
          if (typeof meta?.data !== 'string' || meta.data === '') continue;
          expect({ handler, key: meta.data, ok: IDENTIFIER.test(meta.data) }).toEqual({
            handler,
            key: meta.data,
            ok: true,
          });
        }
      }
    });
  });

  // Pinned because these are the ones that broke.
  it('membership routes keep their exact paths', () => {
    const paths = routesOf(MembershipController)
      .map((r) => r.path)
      .sort();
    expect(paths).toEqual([
      ':groupId/leave',
      ':groupId/member',
      ':groupId/remove/member/:userId',
      ':groupId/update/member/:userId',
    ]);
  });
});
