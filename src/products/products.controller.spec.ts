import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  AdminProductsController,
  AdminTagsController,
} from './admin-products.controller';
import { ProductsController, TagsController } from './products.controller';

const permissionsOf = (cls: { prototype: object }, method: string) =>
  Reflect.getMetadata(
    'permissions',
    Object.getOwnPropertyDescriptor(cls.prototype, method)?.value as object,
  ) as string[];

type Callable = (...a: unknown[]) => Promise<unknown>;

describe('Product controllers', () => {
  const methods = [
    'findAll',
    'findOne',
    'findBySlug',
    'findAllTags',
    'findTagBySlug',
    'create',
    'update',
    'remove',
    'addImage',
    'uploadImage',
    'removeImage',
    'addVariant',
    'updateVariant',
    'removeVariant',
    'createTag',
    'removeTag',
  ];
  const service = Object.fromEntries(
    methods.map((m) => [m, jest.fn().mockResolvedValue(m)]),
  );

  beforeEach(() => jest.clearAllMocks());

  it.each([
    [ProductsController, ['findAll', [{ page: 1 }]]],
    [ProductsController, ['findBySlug', ['ao-thun']]],
    [ProductsController, ['findOne', ['product-1']]],
    [TagsController, ['findAllTags', []]],
    [TagsController, ['findTagBySlug', ['sale']]],
  ] as const)(
    '%p public endpoint %p delegates',
    async (cls, [method, args]) => {
      const controller = new cls(service as never) as unknown as Record<
        string,
        Callable
      >;

      expect(Reflect.getMetadata(GUARDS_METADATA, cls)).toBeUndefined();
      await expect(controller[method](...args)).resolves.toBe(method);
      expect(service[method]).toHaveBeenCalledWith(...args);
    },
  );

  describe('AdminProductsController', () => {
    const controller = new AdminProductsController(
      service as never,
    ) as unknown as Record<string, Callable> & AdminProductsController;

    it('is protected by JwtAuthGuard and PermissionsGuard', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, AdminProductsController),
      ).toEqual([JwtAuthGuard, PermissionsGuard]);
    });

    it.each([
      ['findAll', 'product.read', [{ page: 1 }]],
      ['findOne', 'product.read', ['p']],
      ['create', 'product.create', [{ name: 'x' }]],
      ['update', 'product.update', ['p', { name: 'x' }]],
      ['remove', 'product.delete', ['p']],
      ['addImage', 'product.update', ['p', { url: 'u' }]],
      ['removeImage', 'product.update', ['p', 'img']],
      ['addVariant', 'product.update', ['p', { sku: 's' }]],
      ['updateVariant', 'product.update', ['p', 'v', { stock: 1 }]],
      ['removeVariant', 'product.update', ['p', 'v']],
    ] as const)('%s requires %s and delegates', async (method, perm, args) => {
      expect(permissionsOf(AdminProductsController, method)).toEqual([perm]);
      const callable = controller as Record<string, Callable>;
      await expect(callable[method](...args)).resolves.toBe(method);
      expect(service[method]).toHaveBeenCalledWith(...args);
    });

    it('uploadImage requires product.update and parses multipart fields', async () => {
      const file = { originalname: 'x.png' } as never;

      expect(permissionsOf(AdminProductsController, 'uploadImage')).toEqual([
        'product.update',
      ]);

      await controller.uploadImage('p', file, 'front', 'true', '3', 'v-1');
      expect(service.uploadImage).toHaveBeenLastCalledWith('p', file, {
        alt: 'front',
        isPrimary: true,
        sortOrder: 3,
        variant_id: 'v-1',
      });

      await controller.uploadImage('p', file);
      expect(service.uploadImage).toHaveBeenLastCalledWith('p', file, {
        alt: undefined,
        isPrimary: false,
        sortOrder: 0,
        variant_id: undefined,
      });
    });
  });

  describe('AdminTagsController', () => {
    const controller = new AdminTagsController(service as never);

    it('is protected by JwtAuthGuard and PermissionsGuard', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, AdminTagsController)).toEqual(
        [JwtAuthGuard, PermissionsGuard],
      );
    });

    it('createTag requires product.create', async () => {
      expect(permissionsOf(AdminTagsController, 'createTag')).toEqual([
        'product.create',
      ]);
      await controller.createTag({ name: 'Sale' });
      expect(service.createTag).toHaveBeenCalledWith({ name: 'Sale' });
    });

    it('removeTag requires product.delete', async () => {
      expect(permissionsOf(AdminTagsController, 'removeTag')).toEqual([
        'product.delete',
      ]);
      await controller.removeTag('t');
      expect(service.removeTag).toHaveBeenCalledWith('t');
    });
  });
});
