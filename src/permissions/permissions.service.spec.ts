import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service';

describe('PermissionsService', () => {
  const permission = {
    id: 'perm-1',
    module: 'product',
    action: 'create',
    description: 'Create products',
    isSystem: false,
  };

  const buildService = () => {
    const repo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      create: jest.fn((d: object) => ({ ...d })),
      save: jest.fn((d: object) => Promise.resolve(d)),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    return { service: new PermissionsService(repo as never), repo };
  };

  describe('create', () => {
    it('creates a non-system permission by default', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(null);

      const result = await service.create({
        module: 'product',
        action: 'create',
      } as never);

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { module: 'product', action: 'create' },
      });
      expect(result).toEqual({
        module: 'product',
        action: 'create',
        description: undefined,
        isSystem: false,
      });
    });

    it('rejects a duplicate module/action pair', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(permission);

      await expect(service.create(permission as never)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  it('findAllRaw sorts by module then action', async () => {
    const { service, repo } = buildService();

    await service.findAllRaw();

    expect(repo.find).toHaveBeenCalledWith({
      order: { module: 'ASC', action: 'ASC' },
    });
  });

  it('findAll filters and paginates', async () => {
    const { service, repo } = buildService();
    repo.findAndCount.mockResolvedValue([[permission], 1]);

    const result = await service.findAll({
      page: 2,
      limit: 10,
      module: 'product',
      action: 'create',
    } as never);

    expect(repo.findAndCount).toHaveBeenCalledWith({
      where: { module: 'product', action: 'create' },
      order: { createdAt: 'DESC' },
      skip: 10,
      take: 10,
    });
    expect(result).toEqual({
      data: [permission],
      total: 1,
      page: 2,
      limit: 10,
    });
  });

  it('findAll uses no filters by default', async () => {
    const { service, repo } = buildService();

    await service.findAll({});

    expect(repo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, skip: 0, take: 20 }),
    );
  });

  it('findOne throws NotFoundException when missing', async () => {
    const { service, repo } = buildService();
    repo.findOne.mockResolvedValue(null);

    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
  });

  describe('update', () => {
    it('updates the description', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({ ...permission });

      await expect(
        service.update('perm-1', { description: 'New' }),
      ).resolves.toEqual(expect.objectContaining({ description: 'New' }));
    });

    it('keeps the description when none is given', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({ ...permission });

      await expect(service.update('perm-1', {})).resolves.toEqual(
        expect.objectContaining({ description: 'Create products' }),
      );
    });

    it('refuses to modify a system permission', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({ ...permission, isSystem: true });

      await expect(service.update('perm-1', {})).rejects.toThrow(
        ForbiddenException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('removes a custom permission', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(permission);

      await expect(service.remove('perm-1')).resolves.toEqual({
        message: 'Permission deleted',
      });
      expect(repo.remove).toHaveBeenCalledWith(permission);
    });

    it('refuses to delete a system permission', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({ ...permission, isSystem: true });

      await expect(service.remove('perm-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(repo.remove).not.toHaveBeenCalled();
    });
  });

  it('getMeta returns sorted unique modules and system/custom actions', async () => {
    const { service, repo } = buildService();
    repo.find.mockResolvedValue([
      { module: 'product', action: 'read', isSystem: true },
      { module: 'order', action: 'read', isSystem: true },
      { module: 'order', action: 'create', isSystem: true },
      { module: 'product', action: 'export', isSystem: false },
      { module: 'banner', action: 'export', isSystem: false },
    ]);

    await expect(service.getMeta()).resolves.toEqual({
      modules: ['banner', 'order', 'product'],
      systemActions: ['create', 'read'],
      customActions: ['export'],
    });
    expect(repo.find).toHaveBeenCalledWith({
      select: ['module', 'action', 'isSystem'],
    });
  });
});
