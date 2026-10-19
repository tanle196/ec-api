import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminAuthController } from './admin-auth.controller';

describe('AdminAuthController', () => {
  const tokens = { accessToken: 'a', refreshToken: 'r' };
  const admin = { id: 'user-1', roles: ['admin'], refreshJti: 'jti' };

  const buildController = () => {
    const authService = {
      adminLogin: jest.fn().mockResolvedValue(tokens),
      activeAccount: jest.fn().mockResolvedValue({ id: 'user-1' }),
      rotateRefreshToken: jest.fn().mockResolvedValue(tokens),
      forgotPassword: jest.fn().mockResolvedValue(undefined),
      resetPassword: jest.fn().mockResolvedValue(undefined),
    };
    const usersService = {
      getUserProfile: jest.fn().mockResolvedValue({ id: 'user-1' }),
    };
    const authPolicy = { assertAdminRole: jest.fn() };
    return {
      controller: new AdminAuthController(
        authService as never,
        usersService as never,
        authPolicy as never,
      ),
      authService,
      usersService,
      authPolicy,
    };
  };

  it('login uses the admin-only login flow', async () => {
    const { controller, authService } = buildController();

    await expect(controller.login(admin as never)).resolves.toBe(tokens);
    expect(authService.adminLogin).toHaveBeenCalledWith({ id: 'user-1' });
  });

  describe('me', () => {
    it('returns the profile for an admin', async () => {
      const { controller, authPolicy, usersService } = buildController();

      await expect(controller.me(admin as never)).resolves.toEqual({
        id: 'user-1',
      });
      expect(authPolicy.assertAdminRole).toHaveBeenCalledWith(['admin']);
      expect(usersService.getUserProfile).toHaveBeenCalledWith('user-1');
    });

    it('rejects a non-admin before loading the profile', async () => {
      const { controller, authPolicy, usersService } = buildController();
      authPolicy.assertAdminRole.mockImplementation(() => {
        throw new ForbiddenException();
      });

      await expect(controller.me(admin as never)).rejects.toThrow(
        ForbiddenException,
      );
      expect(usersService.getUserProfile).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the profile is missing', async () => {
      const { controller, usersService } = buildController();
      usersService.getUserProfile.mockResolvedValue(null);

      await expect(controller.me(admin as never)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('refresh', () => {
    it('checks the admin role then rotates', async () => {
      const { controller, authService, authPolicy } = buildController();

      await expect(controller.refresh(admin as never)).resolves.toBe(tokens);
      expect(authPolicy.assertAdminRole).toHaveBeenCalledWith(['admin']);
      expect(authService.rotateRefreshToken).toHaveBeenCalledWith(
        'user-1',
        'jti',
      );
    });

    it('rejects a token without jti', async () => {
      const { controller } = buildController();

      await expect(
        controller.refresh({ ...admin, refreshJti: undefined } as never),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('does not rotate for a non-admin', async () => {
      const { controller, authService, authPolicy } = buildController();
      authPolicy.assertAdminRole.mockImplementation(() => {
        throw new ForbiddenException();
      });

      await expect(controller.refresh(admin as never)).rejects.toThrow(
        ForbiddenException,
      );
      expect(authService.rotateRefreshToken).not.toHaveBeenCalled();
    });
  });

  it('active, forgotPassword and resetPassword delegate to the service', async () => {
    const { controller, authService } = buildController();

    await controller.active({ token: 'tok' });
    await controller.forgotPassword({ email: 'a@example.com' });
    await controller.resetPassword({ newPassword: 'n', token: 't' });

    expect(authService.activeAccount).toHaveBeenCalledWith('tok');
    expect(authService.forgotPassword).toHaveBeenCalledWith('a@example.com');
    expect(authService.resetPassword).toHaveBeenCalledWith('n', 't');
  });
});
