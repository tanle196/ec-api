import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminBannersController } from './admin-banners.controller';
import { BannersController } from './banners.controller';
import { BannerPosition } from './enums/banner-position.enum';
import { BannerMapper } from './mapper/banner.mapper';

const permissionsOf = (method: string) =>
  Reflect.getMetadata(
    'permissions',
    Object.getOwnPropertyDescriptor(AdminBannersController.prototype, method)
      ?.value as object,
  ) as string[];

describe('Banner controllers', () => {
  const bannersService = {
    findActive: jest.fn().mockResolvedValue('findActive'),
    incrementClickCount: jest.fn().mockResolvedValue(undefined),
    findAll: jest.fn().mockResolvedValue('findAll'),
    create: jest.fn().mockResolvedValue('create'),
    uploadImage: jest.fn().mockResolvedValue('uploadImage'),
    reorder: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue('update'),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(() => {
    jest
      .spyOn(BannerMapper, 'toResponse')
      .mockImplementation((b) => ({ mapped: b }) as never);
    jest
      .spyOn(BannerMapper, 'toResponseList')
      .mockImplementation((b) => ({ mappedList: b }) as never);
  });

  beforeEach(() => jest.clearAllMocks());

  describe('BannersController (public)', () => {
    const controller = new BannersController(bannersService as never);

    it('has no auth guard', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, BannersController),
      ).toBeUndefined();
    });

    it('lists active banners for a position', async () => {
      await expect(controller.findActive(BannerPosition.HERO)).resolves.toEqual(
        { mappedList: 'findActive' },
      );
      expect(bannersService.findActive).toHaveBeenCalledWith(
        BannerPosition.HERO,
      );
    });

    it('tracks clicks', async () => {
      await controller.trackClick('banner-1');

      expect(bannersService.incrementClickCount).toHaveBeenCalledWith(
        'banner-1',
      );
    });
  });

  describe('AdminBannersController', () => {
    const controller = new AdminBannersController(bannersService as never);

    it('is protected by JwtAuthGuard and PermissionsGuard', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, AdminBannersController),
      ).toEqual([JwtAuthGuard, PermissionsGuard]);
    });

    it.each([
      ['findAll', 'banner.read'],
      ['create', 'banner.create'],
      ['uploadImage', 'banner.update'],
      ['reorder', 'banner.update'],
      ['update', 'banner.update'],
      ['remove', 'banner.delete'],
    ])('%s requires %s', (method, permission) => {
      expect(permissionsOf(method)).toEqual([permission]);
    });

    it('delegates CRUD endpoints', async () => {
      const dto = { title: 'Sale' };

      await expect(controller.findAll()).resolves.toEqual({
        mappedList: 'findAll',
      });
      await expect(controller.create(dto as never)).resolves.toEqual({
        mapped: 'create',
      });
      await expect(controller.update('b', dto)).resolves.toEqual({
        mapped: 'update',
      });
      await controller.reorder({ items: [] });
      await controller.remove('b');

      expect(bannersService.findAll).toHaveBeenCalledWith(undefined);
      expect(bannersService.create).toHaveBeenCalledWith(dto);
      expect(bannersService.update).toHaveBeenCalledWith('b', dto);
      expect(bannersService.reorder).toHaveBeenCalledWith({ items: [] });
      expect(bannersService.remove).toHaveBeenCalledWith('b');
    });

    it.each([
      ['true', true],
      ['false', false],
      [undefined, false],
    ])('uploadImage parses isMobile=%p as %p', async (raw, expected) => {
      const file = { originalname: 'x.png' };

      await controller.uploadImage('b', file as never, raw);

      expect(bannersService.uploadImage).toHaveBeenCalledWith(
        'b',
        file,
        expected,
      );
    });
  });
});
