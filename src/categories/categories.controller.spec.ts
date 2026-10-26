import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminCategoriesController } from './admin-categories.controller';
import { CategoriesController } from './categories.controller';
import { CategoryMapper } from './mapper/category.mapper';

const permissionsOf = (method: string) =>
  Reflect.getMetadata(
    'permissions',
    Object.getOwnPropertyDescriptor(AdminCategoriesController.prototype, method)
      ?.value as object,
  ) as string[];

describe('Category controllers', () => {
  const service = {
    findAll: jest
      .fn()
      .mockResolvedValue({ data: ['findAll'], total: 1, page: 1, limit: 20 }),
    findTree: jest.fn().mockResolvedValue('findTree'),
    findBySlug: jest.fn().mockResolvedValue('findBySlug'),
    findOne: jest.fn().mockResolvedValue('findOne'),
    create: jest.fn().mockResolvedValue('create'),
    update: jest.fn().mockResolvedValue('update'),
    uploadImage: jest.fn().mockResolvedValue('uploadImage'),
    removeImage: jest.fn().mockResolvedValue('removeImage'),
    remove: jest.fn().mockResolvedValue('remove'),
  };

  beforeAll(() => {
    jest
      .spyOn(CategoryMapper, 'toResponse')
      .mockImplementation((c) => ({ mapped: c }) as never);
  });

  beforeEach(() => jest.clearAllMocks());

  // findTree is already mapped by the service; remove returns a plain result.
  const expected = (method: string): unknown => {
    if (method === 'findAll')
      return { data: [{ mapped: 'findAll' }], total: 1, page: 1, limit: 20 };
    if (method === 'findTree' || method === 'remove') return method;
    return { mapped: method };
  };

  describe('CategoriesController (public)', () => {
    const controller = new CategoriesController(service as never);

    it.each([
      ['findAll', [{ page: 1 }]],
      ['findTree', []],
      ['findBySlug', ['ao']],
      ['findOne', ['cat-1']],
    ] as const)('%s delegates', async (method, args) => {
      await expect(
        (controller[method] as (...a: unknown[]) => Promise<unknown>)(...args),
      ).resolves.toEqual(expected(method));
      expect(service[method]).toHaveBeenCalledWith(...args);
    });
  });

  describe('AdminCategoriesController', () => {
    const controller = new AdminCategoriesController(service as never);

    it('is protected by JwtAuthGuard and PermissionsGuard', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, AdminCategoriesController),
      ).toEqual([JwtAuthGuard, PermissionsGuard]);
    });

    it.each([
      ['findAll', 'category.read', [{ page: 1 }]],
      ['findTree', 'category.read', []],
      ['findOne', 'category.read', ['cat-1']],
      ['create', 'category.create', [{ name: 'Áo' }]],
      ['update', 'category.update', ['cat-1', { name: 'Áo' }]],
      ['uploadImage', 'category.update', ['cat-1', { originalname: 'x' }]],
      ['removeImage', 'category.update', ['cat-1']],
      ['remove', 'category.delete', ['cat-1']],
    ] as const)('%s requires %s and delegates', async (method, perm, args) => {
      expect(permissionsOf(method)).toEqual([perm]);
      await expect(
        (controller[method] as (...a: unknown[]) => Promise<unknown>)(...args),
      ).resolves.toEqual(expected(method));
      expect(service[method]).toHaveBeenCalledWith(...args);
    });
  });
});
