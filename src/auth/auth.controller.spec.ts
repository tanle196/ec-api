import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const tokens = { accessToken: 'a', refreshToken: 'r' };

  const buildController = () => {
    const authService = {
      generateTokens: jest.fn().mockResolvedValue(tokens),
      register: jest.fn().mockResolvedValue({ message: 'ok' }),
      activeAccount: jest.fn().mockResolvedValue({ id: 'user-1' }),
      rotateRefreshToken: jest.fn().mockResolvedValue(tokens),
      forgotPassword: jest.fn().mockResolvedValue(undefined),
      resetPassword: jest.fn().mockResolvedValue(undefined),
    };
    return {
      controller: new AuthController(authService as never),
      authService,
    };
  };

  it('login issues tokens for the authenticated user', async () => {
    const { controller, authService } = buildController();

    await expect(controller.login({ id: 'user-1' } as never)).resolves.toBe(
      tokens,
    );
    expect(authService.generateTokens).toHaveBeenCalledWith({ id: 'user-1' });
  });

  it('register delegates to the service', async () => {
    const { controller, authService } = buildController();
    const dto = { email: 'a@example.com', password: 'secret' };

    await expect(controller.register(dto as never)).resolves.toEqual({
      message: 'ok',
    });
    expect(authService.register).toHaveBeenCalledWith(dto);
  });

  it('active activates with the given token', async () => {
    const { controller, authService } = buildController();

    await controller.active({ token: 'tok' });

    expect(authService.activeAccount).toHaveBeenCalledWith('tok');
  });

  describe('refresh', () => {
    it('rotates the refresh token', async () => {
      const { controller, authService } = buildController();

      await expect(
        controller.refresh({ id: 'user-1', refreshJti: 'jti' } as never),
      ).resolves.toBe(tokens);
      expect(authService.rotateRefreshToken).toHaveBeenCalledWith(
        'user-1',
        'jti',
      );
    });

    it.each([[{ refreshJti: 'jti' }], [{ id: 'user-1' }]])(
      'rejects an incomplete user %p',
      async (user) => {
        const { controller, authService } = buildController();

        await expect(controller.refresh(user as never)).rejects.toThrow(
          UnauthorizedException,
        );
        expect(authService.rotateRefreshToken).not.toHaveBeenCalled();
      },
    );
  });

  it('forgotPassword always returns the generic message', async () => {
    const { controller, authService } = buildController();

    await expect(
      controller.forgotPassword({ email: 'a@example.com' }),
    ).resolves.toEqual({
      message: 'If the email exists, a password reset link has been sent',
    });
    expect(authService.forgotPassword).toHaveBeenCalledWith('a@example.com');
  });

  it('resetPassword passes the new password and token', async () => {
    const { controller, authService } = buildController();

    await expect(
      controller.resetPassword({ newPassword: 'new', token: 'tok' }),
    ).resolves.toEqual({ message: 'Password has been reset successfully' });
    expect(authService.resetPassword).toHaveBeenCalledWith('new', 'tok');
  });

  it('googleCallback issues tokens for the OAuth user', async () => {
    const { controller, authService } = buildController();

    await controller.googleCallback({ user: { id: 'user-1' } } as never);

    expect(authService.generateTokens).toHaveBeenCalledWith({ id: 'user-1' });
  });
});
