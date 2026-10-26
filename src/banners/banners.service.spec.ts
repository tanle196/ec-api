import { NotFoundException } from '@nestjs/common';
import { BannersService } from './banners.service';
import { BannerPosition } from './enums/banner-position.enum';

describe('BannersService', () => {
  const banner = {
    id: 'banner-1',
    title: 'Sale',
    imageUrl: 'https://cdn/old.png',
    imagePublicId: 'banners/old',
    imageMobileUrl: 'https://cdn/old-m.png',
    imageMobilePublicId: 'banners/old-m',
  };

  const buildService = () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const repo = {
      create: jest.fn((d: object) => ({ ...d })),
      save: jest.fn((d: object) => Promise.resolve(d)),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      increment: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const mediaService = {
      delete: jest.fn().mockResolvedValue(undefined),
      uploadOne: jest.fn().mockResolvedValue({
        url: 'https://cdn/new.png',
        publicId: 'banners/new',
      }),
    };
    const service = new BannersService(repo as never, mediaService as never);
    return { service, repo, mediaService, qb };
  };

  describe('create', () => {
    it('defaults isActive to true and sortOrder to 0', async () => {
      const { service, repo } = buildService();

      await service.create({ title: 'Sale' } as never);

      expect(repo.create).toHaveBeenCalledWith({
        title: 'Sale',
        isActive: true,
        sortOrder: 0,
      });
    });

    it('keeps explicit values', async () => {
      const { service, repo } = buildService();

      await service.create({
        title: 'Sale',
        isActive: false,
        sortOrder: 5,
      } as never);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false, sortOrder: 5 }),
      );
    });
  });

  describe('findActive', () => {
    it('filters active banners within their schedule window', async () => {
      const { service, qb } = buildService();

      await service.findActive();

      expect(qb.where).toHaveBeenCalledWith('b.isActive = :active', {
        active: true,
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        '(b.startsAt IS NULL OR b.startsAt <= :now)',
        { now: expect.any(Date) as unknown },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        '(b.endsAt IS NULL OR b.endsAt >= :now)',
        { now: expect.any(Date) as unknown },
      );
      expect(qb.andWhere).not.toHaveBeenCalledWith(
        'b.position = :position',
        expect.anything(),
      );
    });

    it('filters by position when given', async () => {
      const { service, qb } = buildService();

      await service.findActive(BannerPosition.HERO);

      expect(qb.andWhere).toHaveBeenCalledWith('b.position = :position', {
        position: BannerPosition.HERO,
      });
    });
  });

  it('findAll optionally filters by position', async () => {
    const { service, repo } = buildService();

    await service.findAll();
    await service.findAll(BannerPosition.HERO);

    expect(repo.find).toHaveBeenNthCalledWith(1, {
      where: undefined,
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
    expect(repo.find).toHaveBeenNthCalledWith(2, {
      where: { position: BannerPosition.HERO },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
  });

  it('findOne throws NotFoundException when missing', async () => {
    const { service, repo } = buildService();
    repo.findOne.mockResolvedValue(null);

    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
  });

  it('update merges the dto', async () => {
    const { service, repo } = buildService();
    repo.findOne.mockResolvedValue({ ...banner });

    await expect(service.update('banner-1', { title: 'New' })).resolves.toEqual(
      expect.objectContaining({ title: 'New', imageUrl: banner.imageUrl }),
    );
  });

  describe('uploadImage', () => {
    it('replaces the desktop image and deletes the old one', async () => {
      const { service, repo, mediaService } = buildService();
      repo.findOne.mockResolvedValue({ ...banner });
      const file = { originalname: 'x.png' };

      const result = await service.uploadImage(
        'banner-1',
        file as never,
        false,
      );

      expect(mediaService.delete).toHaveBeenCalledWith('banners/old');
      expect(mediaService.uploadOne).toHaveBeenCalledWith(file, 'banners');
      expect(result).toEqual(
        expect.objectContaining({
          imageUrl: 'https://cdn/new.png',
          imagePublicId: 'banners/new',
          imageMobileUrl: banner.imageMobileUrl,
        }),
      );
    });

    it('replaces the mobile image only', async () => {
      const { service, repo, mediaService } = buildService();
      repo.findOne.mockResolvedValue({ ...banner });

      const result = await service.uploadImage('banner-1', {} as never, true);

      expect(mediaService.delete).toHaveBeenCalledWith('banners/old-m');
      expect(result).toEqual(
        expect.objectContaining({
          imageMobileUrl: 'https://cdn/new.png',
          imageMobilePublicId: 'banners/new',
          imageUrl: banner.imageUrl,
        }),
      );
    });

    it('skips deletion when there is no previous image and stores a null publicId', async () => {
      const { service, repo, mediaService } = buildService();
      repo.findOne.mockResolvedValue({ ...banner, imagePublicId: null });
      mediaService.uploadOne.mockResolvedValue({ url: 'https://local/x.png' });

      const result = await service.uploadImage('banner-1', {} as never, false);

      expect(mediaService.delete).not.toHaveBeenCalled();
      expect(result.imagePublicId).toBeNull();
    });

    it('continues uploading if deleting the old image fails', async () => {
      const { service, repo, mediaService } = buildService();
      repo.findOne.mockResolvedValue({ ...banner });
      mediaService.delete.mockRejectedValue(new Error('cdn down'));

      await expect(
        service.uploadImage('banner-1', {} as never, false),
      ).resolves.toEqual(
        expect.objectContaining({ imageUrl: 'https://cdn/new.png' }),
      );
    });
  });

  it('incrementClickCount increments atomically', async () => {
    const { service, repo } = buildService();

    await service.incrementClickCount('banner-1');

    expect(repo.increment).toHaveBeenCalledWith(
      { id: 'banner-1' },
      'clickCount',
      1,
    );
  });

  it('reorder updates each banner sortOrder', async () => {
    const { service, repo } = buildService();

    await service.reorder({
      items: [
        { id: 'a', sortOrder: 0 },
        { id: 'b', sortOrder: 1 },
      ],
    });

    expect(repo.update).toHaveBeenCalledWith('a', { sortOrder: 0 });
    expect(repo.update).toHaveBeenCalledWith('b', { sortOrder: 1 });
  });

  describe('remove', () => {
    it('deletes both images then the banner', async () => {
      const { service, repo, mediaService } = buildService();
      repo.findOne.mockResolvedValue(banner);

      await service.remove('banner-1');

      expect(mediaService.delete).toHaveBeenCalledWith('banners/old');
      expect(mediaService.delete).toHaveBeenCalledWith('banners/old-m');
      expect(repo.remove).toHaveBeenCalledWith(banner);
    });

    it('still removes the banner when image cleanup fails', async () => {
      const { service, repo, mediaService } = buildService();
      repo.findOne.mockResolvedValue(banner);
      mediaService.delete.mockRejectedValue(new Error('cdn down'));

      await service.remove('banner-1');

      expect(repo.remove).toHaveBeenCalledWith(banner);
    });

    it('skips cleanup when there are no stored images', async () => {
      const { service, repo, mediaService } = buildService();
      repo.findOne.mockResolvedValue({
        ...banner,
        imagePublicId: null,
        imageMobilePublicId: null,
      });

      await service.remove('banner-1');

      expect(mediaService.delete).not.toHaveBeenCalled();
    });
  });
});
