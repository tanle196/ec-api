import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const buildContext = (user?: object) =>
    ({
      getHandler: () => () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as never;

  const buildGuard = (required: string[] | undefined) => {
    const reflector = { get: jest.fn().mockReturnValue(required) };
    return new PermissionsGuard(reflector as unknown as Reflector);
  };

  it('allows when no permissions are required', () => {
    expect(buildGuard(undefined).canActivate(buildContext())).toBe(true);
    expect(buildGuard([]).canActivate(buildContext())).toBe(true);
  });

  it('denies when there is no user', () => {
    expect(buildGuard(['product:create']).canActivate(buildContext())).toBe(
      false,
    );
  });

  it('allows when the user has any of the required permissions', () => {
    const guard = buildGuard(['product:create', 'product:update']);

    expect(
      guard.canActivate(buildContext({ permissions: ['product:update'] })),
    ).toBe(true);
  });

  it('denies when the user has none of the required permissions', () => {
    const guard = buildGuard(['product:create']);

    expect(
      guard.canActivate(buildContext({ permissions: ['product:read'] })),
    ).toBe(false);
  });

  it('denies when the user has no permissions array', () => {
    expect(
      buildGuard(['product:create']).canActivate(buildContext({ roles: [] })),
    ).toBe(false);
  });
});
