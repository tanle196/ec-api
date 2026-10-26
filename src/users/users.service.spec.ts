import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const user = {
    id: 'user-1',
    userCode: 'USR-1',
    email: 'a@example.com',
    fullName: 'A',
    avatar: null,
    roles: [
      {
        id: 'role-1',
        name: 'admin',
        permissions: [
          { module: 'product', action: 'create' },
          { module: 'order', action: 'read' },
        ],
      },
    ],
    permissions: [
      { module: 'order', action: 'read' },
      { module: 'user', action: 'delete' },
    ],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
  };

  const buildService = () => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const repo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      remove: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockImplementation((d) => Promise.resolve(d)),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const roleRepo = { findBy: jest.fn().mockResolvedValue([]) };
    const permissionRepo = { findBy: jest.fn().mockResolvedValue([]) };
    const service = new UsersService(
      repo as never,
      roleRepo as never,
      permissionRepo as never,
    );
    return { service, repo, roleRepo, permissionRepo, qb };
  };

  it('findById looks up by id', async () => {
    const { service, repo } = buildService();
    repo.findOne.mockResolvedValue(user);

    await expect(service.findById('user-1')).resolves.toBe(user);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('findByEmail loads identities', async () => {
    const { service, repo } = buildService();

    await service.findByEmail('a@example.com');

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { email: 'a@example.com' },
      relations: ['identities'],
    });
  });

  describe.each([
    ['findByIdWithRelations', { id: 'user-1' }],
    ['findByUserCode', { userCode: 'user-1' }],
  ] as const)('%s', (method, where) => {
    it('returns the detail DTO', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(user);

      const result = await service[method]('user-1');

      expect(repo.findOne).toHaveBeenCalledWith({
        where,
        relations: ['roles', 'permissions'],
      });
      expect(result).toEqual({
        id: 'user-1',
        userCode: 'USR-1',
        email: 'a@example.com',
        fullName: 'A',
        avatar: null,
        roles: user.roles,
        permissions: user.permissions,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    });

    it('defaults missing relations and userCode', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({
        ...user,
        userCode: null,
        roles: undefined,
        permissions: undefined,
      });

      const result = await service[method]('user-1');

      expect(result).toEqual(
        expect.objectContaining({ userCode: '', roles: [], permissions: [] }),
      );
    });

    it('throws NotFoundException when missing', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(null);

      await expect(service[method]('x')).rejects.toThrow(NotFoundException);
    });
  });

  it('update applies the change and returns the fresh user', async () => {
    const { service, repo } = buildService();
    repo.findOne.mockResolvedValue(user);

    await expect(service.update('user-1', { fullName: 'B' })).resolves.toBe(
      user,
    );
    expect(repo.update).toHaveBeenCalledWith('user-1', { fullName: 'B' });
  });

  describe('delete', () => {
    it('removes an existing user', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(user);

      await service.delete('user-1');

      expect(repo.remove).toHaveBeenCalledWith(user);
    });

    it('throws NotFoundException when missing', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(null);

      await expect(service.delete('x')).rejects.toThrow(NotFoundException);
      expect(repo.remove).not.toHaveBeenCalled();
    });
  });

  describe.each([
    ['assignRoles', 'roleRepo', 'roles'],
    ['assignPermissions', 'permissionRepo', 'permissions'],
  ] as const)('%s', (method, relatedRepo, field) => {
    it('replaces the relation with the looked-up entities', async () => {
      const ctx = buildService();
      const entity = { ...user };
      ctx.repo.findOne.mockResolvedValue(entity);
      const found = [{ id: 'x-1' }];
      ctx[relatedRepo].findBy.mockResolvedValue(found);

      await ctx.service[method]('user-1', ['x-1']);

      expect(ctx[relatedRepo].findBy).toHaveBeenCalledWith({
        id: expect.objectContaining({
          _type: 'in',
          _value: ['x-1'],
        }) as unknown,
      });
      expect(ctx.repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ [field]: found }),
      );
    });

    it('clears the relation for an empty list without querying', async () => {
      const ctx = buildService();
      ctx.repo.findOne.mockResolvedValue({ ...user });

      await ctx.service[method]('user-1', []);

      expect(ctx[relatedRepo].findBy).not.toHaveBeenCalled();
      expect(ctx.repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ [field]: [] }),
      );
    });

    it('throws NotFoundException for an unknown user', async () => {
      const ctx = buildService();
      ctx.repo.findOne.mockResolvedValue(null);

      await expect(ctx.service[method]('x', ['x-1'])).rejects.toThrow(
        NotFoundException,
      );
      expect(ctx.repo.save).not.toHaveBeenCalled();
    });
  });

  describe('getUserProfile', () => {
    it('merges role and direct permissions without duplicates', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(user);

      const profile = await service.getUserProfile('user-1');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        relations: ['roles', 'roles.permissions', 'permissions'],
      });
      expect(profile).toEqual({
        id: 'user-1',
        name: 'A',
        email: 'a@example.com',
        roles: ['admin'],
        permissions: ['product.create', 'order.read', 'user.delete'],
      });
    });

    it('handles users without roles or permissions', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({
        ...user,
        roles: undefined,
        permissions: undefined,
      });

      await expect(service.getUserProfile('user-1')).resolves.toEqual(
        expect.objectContaining({ roles: [], permissions: [] }),
      );
    });

    it('handles roles without loaded permissions', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({
        ...user,
        roles: [{ name: 'staff' }],
        permissions: [],
      });

      await expect(service.getUserProfile('user-1')).resolves.toEqual(
        expect.objectContaining({ roles: ['staff'], permissions: [] }),
      );
    });

    it('returns null for an unknown user', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(null);

      await expect(service.getUserProfile('x')).resolves.toBeNull();
    });
  });

  describe('findAll', () => {
    it('paginates with defaults and maps users', async () => {
      const { service, qb } = buildService();
      qb.getManyAndCount.mockResolvedValue([[user], 1]);

      const result = await service.findAll({});

      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.data[0]).toEqual(
        expect.objectContaining({ id: 'user-1', email: 'a@example.com' }),
      );
    });

    it('applies email (partial) and userCode (exact) filters', async () => {
      const { service, qb } = buildService();

      await service.findAll({
        page: 3,
        limit: 10,
        email: 'gmail',
        userCode: 'USR-1',
      });

      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(qb.andWhere).toHaveBeenCalledWith('u.email ILIKE :email', {
        email: '%gmail%',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('u.userCode = :userCode', {
        userCode: 'USR-1',
      });
    });
  });
});
