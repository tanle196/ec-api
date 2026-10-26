import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RolesService } from './roles.service';

describe('RolesService', () => {
  const role = {
    id: 'role-1',
    name: 'staff',
    description: 'Staff',
    permissions: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const buildService = () => {
    const repo = {
      findOne: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      create: jest.fn((d: object) => ({ ...d })),
      save: jest.fn((d: object) => Promise.resolve(d)),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const permissionRepo = {
      find: jest.fn().mockResolvedValue([]),
      findBy: jest.fn().mockResolvedValue([]),
    };
    const service = new RolesService(repo as never, permissionRepo as never);
    return { service, repo, permissionRepo };
  };

  describe('create', () => {
    it('creates a role with the requested permissions', async () => {
      const { service, repo, permissionRepo } = buildService();
      repo.findOne.mockResolvedValue(null);
      const perms = [{ id: 'perm-1' }];
      permissionRepo.find.mockResolvedValue(perms);

      const result = await service.create({
        name: 'staff',
        description: 'Staff',
        permissions: ['perm-1'],
      });

      expect(permissionRepo.find).toHaveBeenCalledWith({
        where: {
          id: expect.objectContaining({ _value: ['perm-1'] }) as unknown,
        },
      });
      expect(result).toEqual({
        name: 'staff',
        description: 'Staff',
        permissions: perms,
      });
    });

    it('creates a role without permissions when none are given', async () => {
      const { service, repo, permissionRepo } = buildService();
      repo.findOne.mockResolvedValue(null);

      const result = await service.create({ name: 'staff' });

      expect(permissionRepo.find).not.toHaveBeenCalled();
      expect(result.permissions).toEqual([]);
    });

    it('rejects a duplicate role name', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(role);

      await expect(service.create({ name: 'staff' })).rejects.toThrow(
        ConflictException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('paginates and filters by name case-insensitively', async () => {
      const { service, repo } = buildService();
      repo.findAndCount.mockResolvedValue([[role], 1]);

      const result = await service.findAll({ page: 2, limit: 5, name: 'sta' });

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: {
          name: expect.objectContaining({
            _type: 'ilike',
            _value: '%sta%',
          }) as unknown,
        },
        relations: ['permissions'],
        order: { createdAt: 'DESC' },
        skip: 5,
        take: 5,
      });
      expect(result).toEqual({
        data: [role],
        total: 1,
        page: 2,
        limit: 5,
      });
    });

    it('uses no filter and default pagination', async () => {
      const { service, repo } = buildService();

      await service.findAll({});

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, skip: 0, take: 20 }),
      );
    });
  });

  describe('findOne', () => {
    it('returns the role with permissions', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(role);

      await expect(service.findOne('role-1')).resolves.toBe(role);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'role-1' },
        relations: ['permissions'],
      });
    });

    it('throws NotFoundException when missing', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates only provided fields', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({ ...role });

      const result = await service.update('role-1', { description: 'New' });

      expect(result).toEqual(
        expect.objectContaining({ name: 'staff', description: 'New' }),
      );
    });

    it('allows renaming', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({ ...role });

      await expect(
        service.update('role-1', { name: 'support' }),
      ).resolves.toEqual(expect.objectContaining({ name: 'support' }));
    });

    it('refuses to modify the ADMIN role', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({ ...role, name: 'ADMIN' });

      await expect(service.update('role-1', { name: 'x' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('removes a role', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(role);

      await expect(service.remove('role-1')).resolves.toEqual({
        success: true,
      });
      expect(repo.remove).toHaveBeenCalledWith(role);
    });

    it('refuses to delete the ADMIN role', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({ ...role, name: 'ADMIN' });

      await expect(service.remove('role-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(repo.remove).not.toHaveBeenCalled();
    });
  });

  it('assignPermissions replaces the role permissions', async () => {
    const { service, repo, permissionRepo } = buildService();
    repo.findOne.mockResolvedValue({ ...role });
    const perms = [{ id: 'perm-1' }];
    permissionRepo.findBy.mockResolvedValue(perms);

    const result = await service.assignPermissions('role-1', ['perm-1']);

    expect(result.permissions).toBe(perms);
  });
});
