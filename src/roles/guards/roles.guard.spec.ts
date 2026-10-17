import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const buildContext = (user?: object) =>
    ({
      getHandler: () => () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as never;

  const buildGuard = (required: string[] | undefined) => {
    const reflector = { get: jest.fn().mockReturnValue(required) };
    return new RolesGuard(reflector as unknown as Reflector);
  };

  it('allows when no roles are required', () => {
    expect(buildGuard(undefined).canActivate(buildContext())).toBe(true);
  });

  it('allows when the user has one of the required roles', () => {
    expect(
      buildGuard(['admin', 'staff']).canActivate(
        buildContext({ roles: ['staff'] }),
      ),
    ).toBe(true);
  });

  it('denies when the user lacks the required roles', () => {
    expect(
      buildGuard(['admin']).canActivate(buildContext({ roles: ['customer'] })),
    ).toBe(false);
  });

  it('denies when there is no user', () => {
    expect(buildGuard(['admin']).canActivate(buildContext())).toBe(false);
  });
});
