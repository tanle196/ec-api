import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  const buildController = () => {
    const usersService = { getUserProfile: jest.fn() };
    return {
      controller: new UsersController(usersService as never),
      usersService,
    };
  };

  it('is protected by JwtAuthGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, UsersController)).toContain(
      JwtAuthGuard,
    );
  });

  it('returns the current user profile', async () => {
    const { controller, usersService } = buildController();
    usersService.getUserProfile.mockResolvedValue({ id: 'user-1' });

    await expect(
      controller.getProfile({ id: 'user-1' } as never),
    ).resolves.toEqual({ id: 'user-1' });
    expect(usersService.getUserProfile).toHaveBeenCalledWith('user-1');
  });

  it('throws NotFoundException when the profile is missing', async () => {
    const { controller, usersService } = buildController();
    usersService.getUserProfile.mockResolvedValue(null);

    await expect(
      controller.getProfile({ id: 'user-1' } as never),
    ).rejects.toThrow(NotFoundException);
  });
});
