import { CategoryPolicy } from './policies/category.policy';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  const category = {
    id: 'cat-1',
    name: 'Áo',
    slug: 'ao',
    parent_id: null as string | null,
    image: null as string | null,
    imagePublicId: null as string | null,
    description: null as string | null,
    sortOrder: 0,
    isActive: true,
  };

  const buildService = () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      exists: jest.fn().mockResolvedValue(false),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((d: object) => ({ ...d })),
      save: jest.fn((d: object) => Promise.resolve(d)),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const mediaService = {
      delete: jest.fn().mockResolvedValue(undefined),
      uploadOne: jest
        .fn()
        .mockResolvedValue({ url: 'https://cdn/new.png', publicId: 'cat/new' }),
    };
    const service = new CategoriesService(
      repo as never,
      mediaService as never,
      new CategoryPolicy(),
    );
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
    return { service, repo, mediaService };
  };

  describe('create', () => {
    it('generates a slug from the name and applies defaults', async () => {
      const { service, repo } = buildService();

      const result = await service.create({ name: 'Áo thun' });

      expect(repo.exists).toHaveBeenCalledWith({ where: { slug: 'ao-thun' } });
      expect(result).toEqual({
        name: 'Áo thun',
        slug: 'ao-thun',
        parent_id: null,
        description: null,
        image: null,
        sortOrder: 0,
        isActive: true,
      });
    });

    it('uses a provided unique slug', async () => {
      const { service } = buildService();

      await expect(
        service.create({ name: 'Áo', slug: 'custom' }),
      ).resolves.toEqual(expect.objectContaining({ slug: 'custom' }));
    });

    it('rejects a provided slug that already exists', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(category);

      await expect(service.create({ name: 'Áo', slug: 'ao' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('validates the parent exists', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.create({ name: 'Áo', parent_id: 'missing' }),
      ).rejects.toThrow(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('creates a child category under an existing parent', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(category);

      await expect(
        service.create({ name: 'Áo thun', parent_id: 'cat-1' }),
      ).resolves.toEqual(expect.objectContaining({ parent_id: 'cat-1' }));
    });
  });

  describe('findAll', () => {
    it('builds filters and pagination', async () => {
      const { service, repo } = buildService();
      repo.findAndCount.mockResolvedValue([[category], 1]);

      const result = await service.findAll({
        page: 2,
        limit: 10,
        name: 'ao',
        parent_id: 'cat-1',
        isActive: false,
      });

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: {
          name: expect.objectContaining({
            _type: 'ilike',
            _value: '%ao%',
          }) as unknown,
          parent_id: 'cat-1',
          isActive: false,
        },
        order: { sortOrder: 'ASC', createdAt: 'DESC' },
        skip: 10,
        take: 10,
      });
      expect(result).toEqual({
        data: [category],
        total: 1,
        page: 2,
        limit: 10,
      });
    });

    it('omits filters that are not provided', async () => {
      const { service, repo } = buildService();

      await service.findAll({});

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, skip: 0, take: 20 }),
      );
    });
  });

  describe.each([
    ['findOne', { id: 'x' }],
    ['findBySlug', { slug: 'x' }],
  ] as const)('%s', (method, where) => {
    it('loads parent and children', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(category);

      await expect(service[method]('x')).resolves.toBe(category);
      expect(repo.findOne).toHaveBeenCalledWith({
        where,
        relations: ['parent', 'children'],
      });
    });

    it('throws NotFoundException when missing', async () => {
      const { service } = buildService();

      await expect(service[method]('x')).rejects.toThrow(NotFoundException);
    });
  });

  it('findTree builds a nested tree from roots', async () => {
    const { service, repo } = buildService();
    const root = { id: 'root', parent_id: null };
    const child = { id: 'child', parent_id: 'root' };
    const grandchild = { id: 'grandchild', parent_id: 'child' };
    repo.find.mockImplementation(
      ({ where }: { where: { parent_id: unknown } }) => {
        if (where.parent_id === 'root') return Promise.resolve([child]);
        if (where.parent_id === 'child') return Promise.resolve([grandchild]);
        if (where.parent_id === 'grandchild') return Promise.resolve([]);
        return Promise.resolve([root]); // IsNull()
      },
    );

    await expect(service.findTree()).resolves.toEqual([
      {
        ...root,
        children: [{ ...child, children: [{ ...grandchild, children: [] }] }],
      },
    ]);
  });

  describe('update', () => {
    it('regenerates the slug (excluding itself) when only the name changes', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValueOnce({ ...category });

      const result = await service.update('cat-1', { name: 'Quần jean' });

      expect(repo.exists).toHaveBeenCalledWith({
        where: {
          slug: 'quan-jean',
          id: expect.objectContaining({ _type: 'not' }) as unknown,
        },
      });
      expect(result).toEqual(
        expect.objectContaining({ name: 'Quần jean', slug: 'quan-jean' }),
      );
    });

    it('rejects a slug taken by another category', async () => {
      const { service, repo } = buildService();
      repo.findOne
        .mockResolvedValueOnce({ ...category })
        .mockResolvedValueOnce({ id: 'other', slug: 'taken' });

      await expect(service.update('cat-1', { slug: 'taken' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('keeps the same slug without a conflict check', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValueOnce({ ...category });

      await service.update('cat-1', { slug: 'ao' });

      expect(repo.findOne).toHaveBeenCalledTimes(1);
    });

    it('rejects making a category its own parent', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValueOnce({ ...category });

      await expect(
        service.update('cat-1', { parent_id: 'cat-1' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects an unknown parent', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValueOnce({ ...category });

      await expect(
        service.update('cat-1', { parent_id: 'missing' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('moves a category to root with parent_id null', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValueOnce({ ...category, parent_id: 'p' });

      await expect(
        service.update('cat-1', { parent_id: null } as never),
      ).resolves.toEqual(expect.objectContaining({ parent_id: null }));
    });

    it('updates the remaining scalar fields', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValueOnce({ ...category });

      const result = await service.update('cat-1', {
        description: 'desc',
        image: 'https://img',
        sortOrder: 3,
        isActive: false,
      });

      expect(result).toEqual(
        expect.objectContaining({
          slug: 'ao',
          description: 'desc',
          image: 'https://img',
          sortOrder: 3,
          isActive: false,
        }),
      );
    });
  });

  describe('uploadImage', () => {
    it('deletes the old cloud image and stores the new one', async () => {
      const { service, repo, mediaService } = buildService();
      repo.findOne.mockResolvedValue({ ...category, imagePublicId: 'cat/old' });
      const file = { originalname: 'x.png' };

      const result = await service.uploadImage('cat-1', file as never);

      expect(mediaService.delete).toHaveBeenCalledWith('cat/old');
      expect(mediaService.uploadOne).toHaveBeenCalledWith(
        file,
        'categories/cat-1',
      );
      expect(result).toEqual(
        expect.objectContaining({
          image: 'https://cdn/new.png',
          imagePublicId: 'cat/new',
        }),
      );
    });

    it('logs and continues if the old image cannot be deleted', async () => {
      const { service, repo, mediaService } = buildService();
      repo.findOne.mockResolvedValue({ ...category, imagePublicId: 'cat/old' });
      mediaService.delete.mockRejectedValue(new Error('cdn'));

      await expect(service.uploadImage('cat-1', {} as never)).resolves.toEqual(
        expect.objectContaining({ imagePublicId: 'cat/new' }),
      );
      expect(jest.spyOn(service['logger'], 'warn')).toHaveBeenCalled();
    });
  });

  describe('removeImage', () => {
    it('clears the image and deletes the cloud asset', async () => {
      const { service, repo, mediaService } = buildService();
      repo.findOne.mockResolvedValue({
        ...category,
        image: 'https://cdn/old.png',
        imagePublicId: 'cat/old',
      });

      const result = await service.removeImage('cat-1');

      expect(mediaService.delete).toHaveBeenCalledWith('cat/old');
      expect(result).toEqual(
        expect.objectContaining({ image: null, imagePublicId: null }),
      );
    });

    it('still clears the image when deletion fails', async () => {
      const { service, repo, mediaService } = buildService();
      repo.findOne.mockResolvedValue({ ...category, imagePublicId: 'cat/old' });
      mediaService.delete.mockRejectedValue(new Error('cdn'));

      await expect(service.removeImage('cat-1')).resolves.toEqual(
        expect.objectContaining({ imagePublicId: null }),
      );
    });

    it('does not call the CDN for a non-cloud image', async () => {
      const { service, repo, mediaService } = buildService();
      repo.findOne.mockResolvedValue({ ...category, image: 'https://x' });

      await service.removeImage('cat-1');

      expect(mediaService.delete).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('removes a leaf category', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(category);

      await expect(service.remove('cat-1')).resolves.toEqual({ success: true });
      expect(repo.count).toHaveBeenCalledWith({
        where: { parent_id: 'cat-1' },
      });
      expect(repo.remove).toHaveBeenCalledWith(category);
    });

    it('refuses to remove a category with children', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(category);
      repo.count.mockResolvedValue(2);

      await expect(service.remove('cat-1')).rejects.toThrow(ConflictException);
      expect(repo.remove).not.toHaveBeenCalled();
    });
  });
});
