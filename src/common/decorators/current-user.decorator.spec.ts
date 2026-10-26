import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator';

describe('CurrentUser decorator', () => {
  const getFactory = () => {
    class TestController {
      handler(@CurrentUser() user: unknown) {
        return user;
      }
    }
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      TestController,
      'handler',
    ) as Record<string, { factory: (data: unknown, ctx: unknown) => unknown }>;
    return Object.values(args)[0].factory;
  };

  it('returns request.user', () => {
    const user = { id: 'user-1', roles: [], permissions: [] };
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ user }) }) };

    expect(getFactory()(undefined, ctx)).toBe(user);
  });

  it('returns undefined when unauthenticated', () => {
    const ctx = { switchToHttp: () => ({ getRequest: () => ({}) }) };

    expect(getFactory()(undefined, ctx)).toBeUndefined();
  });
});
