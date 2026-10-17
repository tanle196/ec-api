import { UnauthorizedException } from '@nestjs/common';
import { JwtRefreshStrategy } from './jwt-refresh.strategy';
import { JwtStrategy } from './jwt.strategy';
import { LocalStrategy } from './local.strategy';

describe('auth strategies', () => {
  const config = {
    getJwtConfig: () => ({
      accessSecret: 'access-secret',
      refreshSecret: 'refresh-secret',
    }),
  };

  describe('JwtStrategy', () => {
    const strategy = new JwtStrategy(config as never);

    it('maps the payload to the current user', () => {
      expect(
        strategy.validate({
          sub: 'user-1',
          email: 'a@example.com',
          roles: ['admin'],
          permissions: ['p'],
        }),
      ).toEqual({
        id: 'user-1',
        email: 'a@example.com',
        roles: ['admin'],
        permissions: ['p'],
      });
    });

    it('defaults missing roles/permissions to empty arrays', () => {
      expect(strategy.validate({ sub: 'user-1', email: 'a' } as never)).toEqual(
        expect.objectContaining({ roles: [], permissions: [] }),
      );
    });

    it('rejects a payload without sub', () => {
      expect(() => strategy.validate({ email: 'a' } as never)).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('JwtRefreshStrategy', () => {
    const strategy = new JwtRefreshStrategy(config as never);

    it('includes the refresh jti', () => {
      expect(
        strategy.validate({ sub: 'user-1', email: 'a', jti: 'jti' } as never),
      ).toEqual({
        id: 'user-1',
        email: 'a',
        roles: [],
        permissions: [],
        refreshJti: 'jti',
      });
    });

    it.each([[{ sub: 'user-1' }], [{ jti: 'jti' }]])(
      'rejects incomplete payload %p',
      (payload) => {
        expect(() => strategy.validate(payload as never)).toThrow(
          UnauthorizedException,
        );
      },
    );
  });

  describe('LocalStrategy', () => {
    it('delegates credential validation to AuthService', async () => {
      const authService = {
        validateLocalUser: jest.fn().mockResolvedValue({ id: 'user-1' }),
      };
      const strategy = new LocalStrategy(authService as never);

      await expect(
        strategy.validate('a@example.com', 'secret'),
      ).resolves.toEqual({ id: 'user-1' });
      expect(authService.validateLocalUser).toHaveBeenCalledWith(
        'a@example.com',
        'secret',
      );
    });
  });
});
