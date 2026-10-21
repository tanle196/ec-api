import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  AdminProductsController,
  AdminTagsController,
} from './admin-products.controller';
import { ProductsController, TagsController } from './products.controller';
import { ProductMapper } from './mapper/product.mapper';

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
  service.findAll.mockResolvedValue({
    data: ['findAll'],
    total: 1,
    page: 1,
    limit: 20,
  });

  // Tag each mapper's output so the tests prove which mapper the controller used.
  const tagged =
    (tag: string) =>
    (value: unknown): never =>
      ({ [tag]: value }) as never;

  beforeAll(() => {
    jest.spyOn(ProductMapper, 'toListItem').mockImplementation(tagged('list'));
    jest.spyOn(ProductMapper, 'toResponse').mockImplementation(tagged('admin'));
    jest
      .spyOn(ProductMapper, 'toPublicResponse')
      .mockImplementation(tagged('public'));
    jest.spyOn(ProductMapper, 'toImage').mockImplementation(tagged('image'));
    jest
      .spyOn(ProductMapper, 'toVariant')
      .mockImplementation(tagged('variant'));
    jest.spyOn(ProductMapper, 'toTag').mockImplementation(tagged('tag'));
    jest.spyOn(ProductMapper, 'toTagList').mockImplementation(tagged('tags'));
  });

  const page = (item: unknown) => ({
    data: [item],
    total: 1,
    page: 1,
    limit: 20,
  });

  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['findAll', [{ page: 1 }], page({ list: 'findAll' })],
    ['findBySlug', ['ao-thun'], { public: 'findBySlug' }],
    ['findOne', ['product-1'], { public: 'findOne' }],
  ] as const)(
    'public ProductsController.%s only exposes published products',
    async (method, args, expected) => {
      const controller = new ProductsController(
        service as never,
      ) as unknown as Record<string, Callable>;

      expect(
        Reflect.getMetadata(GUARDS_METADATA, ProductsController),
      ).toBeUndefined();
      await expect(controller[method](...args)).resolves.toEqual(expected);
      expect(service[method]).toHaveBeenCalledWith(...args, {
        publishedOnly: true,
      });
    },
  );

  it.each([
    ['findAllTags', [], { tags: 'findAllTags' }],
    ['findTagBySlug', ['sale'], { tag: 'findTagBySlug' }],
  ] as const)(
    'public TagsController.%s delegates',
    async (method, args, expected) => {
      const controller = new TagsController(
        service as never,
      ) as unknown as Record<string, Callable>;

      expect(
        Reflect.getMetadata(GUARDS_METADATA, TagsController),
      ).toBeUndefined();
      await expect(controller[method](...args)).resolves.toEqual(expected);
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
      ['findAll', 'product.read', [{ page: 1 }], page({ list: 'findAll' })],
      ['findOne', 'product.read', ['p'], { admin: 'findOne' }],
      ['create', 'product.create', [{ name: 'x' }], { admin: 'create' }],
      ['update', 'product.update', ['p', { name: 'x' }], { admin: 'update' }],
      ['remove', 'product.delete', ['p'], 'remove'],
      [
        'addImage',
        'product.update',
        ['p', { url: 'u' }],
        { image: 'addImage' },
      ],
      ['removeImage', 'product.update', ['p', 'img'], 'removeImage'],
      [
        'addVariant',
        'product.update',
        ['p', { sku: 's' }],
        { variant: 'addVariant' },
      ],
      [
        'updateVariant',
        'product.update',
        ['p', 'v', { stock: 1 }],
        { variant: 'updateVariant' },
      ],
      ['removeVariant', 'product.update', ['p', 'v'], 'removeVariant'],
    ] as const)(
      '%s requires %s and delegates',
      async (method, perm, args, expected) => {
        expect(permissionsOf(AdminProductsController, method)).toEqual([perm]);
        const callable = controller as Record<string, Callable>;
        await expect(callable[method](...args)).resolves.toEqual(expected);
        expect(service[method]).toHaveBeenCalledWith(...args);
      },
    );

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
      await expect(controller.createTag({ name: 'Sale' })).resolves.toEqual({
        tag: 'createTag',
      });
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
