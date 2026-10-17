import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProductStatus } from './enums/product-status.enum';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const product = {
    id: 'product-1',
    name: 'Áo thun',
    slug: 'ao-thun',
    sku: 'SKU-1',
    category_id: 'cat-1',
    description: null as string | null,
    basePrice: 100,
    status: ProductStatus.DRAFT,
    isFeatured: false,
    tags: [] as { id: string }[],
  };

  const buildService = () => {
    const qb = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[product], 1]),
    };
    const productRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn((d: object) => ({ ...d })),
      save: jest.fn((d: object) => Promise.resolve({ id: 'product-1', ...d })),
      remove: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const imageRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((d: object) => ({ ...d })),
      save: jest.fn((d: unknown) => Promise.resolve(d)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const variantRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((d: object) => ({ ...d })),
      save: jest.fn((d: unknown) => Promise.resolve(d)),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const tagRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn((d: object) => ({ ...d })),
      save: jest.fn((d: object) => Promise.resolve(d)),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const mediaService = {
      uploadOne: jest
        .fn()
        .mockResolvedValue({ url: 'https://cdn/x.png', publicId: 'p/x' }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ProductsService(
      productRepo as never,
      imageRepo as never,
      variantRepo as never,
      tagRepo as never,
      mediaService as never,
    );
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
    return {
      service,
      productRepo,
      imageRepo,
      variantRepo,
      tagRepo,
      mediaService,
      qb,
    };
  };

  /** Makes `productRepo.findOne` return the product only for id lookups. */
  const withExistingProduct = (
    repo: { findOne: jest.Mock },
    value: object = product,
  ) =>
    repo.findOne.mockImplementation(({ where }: { where: { id?: string } }) =>
      Promise.resolve(where.id ? { ...value } : null),
    );

  describe('create', () => {
    const dto = {
      category_id: 'cat-1',
      name: 'Áo thun',
      basePrice: 100,
      sku: 'SKU-1',
    };

    it('creates a draft product with a generated slug', async () => {
      const ctx = buildService();
      withExistingProduct(ctx.productRepo);

      await ctx.service.create(dto);

      expect(ctx.productRepo.create).toHaveBeenCalledWith({
        category_id: 'cat-1',
        name: 'Áo thun',
        slug: 'ao-thun',
        description: null,
        basePrice: 100,
        sku: 'SKU-1',
        status: ProductStatus.DRAFT,
        isFeatured: false,
        tags: [],
      });
      expect(ctx.imageRepo.save).not.toHaveBeenCalled();
      expect(ctx.variantRepo.save).not.toHaveBeenCalled();
    });

    it('saves images, variants and tags linked to the new product', async () => {
      const ctx = buildService();
      withExistingProduct(ctx.productRepo);
      ctx.tagRepo.find.mockResolvedValue([{ id: 'tag-1' }]);

      await ctx.service.create({
        ...dto,
        tagIds: ['tag-1'],
        images: [{ url: 'https://img' }],
        variants: [{ sku: 'V-1', name: 'M', price: 100 }],
      });

      expect(ctx.productRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tags: [{ id: 'tag-1' }] }),
      );
      expect(ctx.imageRepo.save).toHaveBeenCalledWith([
        { url: 'https://img', product_id: 'product-1' },
      ]);
      expect(ctx.variantRepo.save).toHaveBeenCalledWith([
        { sku: 'V-1', name: 'M', price: 100, product_id: 'product-1' },
      ]);
    });

    it('rejects a duplicate explicit slug', async () => {
      const ctx = buildService();
      ctx.productRepo.findOne.mockResolvedValue(product);

      await expect(
        ctx.service.create({ ...dto, slug: 'ao-thun' }),
      ).rejects.toThrow("Slug 'ao-thun' already exists");
    });

    it('rejects a duplicate product SKU', async () => {
      const ctx = buildService();
      ctx.productRepo.findOne.mockImplementation(
        ({ where }: { where: { sku?: string } }) =>
          Promise.resolve(where.sku ? product : null),
      );

      await expect(ctx.service.create(dto as never)).rejects.toThrow(
        "SKU 'SKU-1' already exists",
      );
    });

    it('rejects a duplicate variant SKU before saving anything', async () => {
      const ctx = buildService();
      ctx.variantRepo.findOne.mockResolvedValue({ id: 'v' });

      await expect(
        ctx.service.create({ ...dto, variants: [{ sku: 'V-1' }] } as never),
      ).rejects.toThrow("Variant SKU 'V-1' already exists");
      expect(ctx.productRepo.save).not.toHaveBeenCalled();
    });

    it('rejects unknown tag ids', async () => {
      const ctx = buildService();
      ctx.tagRepo.find.mockResolvedValue([{ id: 'tag-1' }]);

      await expect(
        ctx.service.create({ ...dto, tagIds: ['tag-1', 'tag-2'] }),
      ).rejects.toThrow('Tags not found: tag-2');
    });
  });

  describe('findAll', () => {
    it('applies filters and pagination', async () => {
      const { service, qb } = buildService();

      const result = await service.findAll({
        page: 3,
        limit: 5,
        name: 'ao',
        category_id: 'cat-1',
        status: ProductStatus.PUBLISHED,
        isFeatured: false,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('p.name ILIKE :name', {
        name: '%ao%',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('p.category_id = :category_id', {
        category_id: 'cat-1',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('p.status = :status', {
        status: ProductStatus.PUBLISHED,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('p.isFeatured = :isFeatured', {
        isFeatured: false,
      });
      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(result).toEqual({ data: [product], total: 1, page: 3, limit: 5 });
    });

    it('applies no filters by default', async () => {
      const { service, qb } = buildService();

      await service.findAll({});

      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(qb.take).toHaveBeenCalledWith(20);
    });
  });

  describe.each([
    ['findOne', { id: 'x' }],
    ['findBySlug', { slug: 'x' }],
  ] as const)('%s', (method, where) => {
    it('loads all relations', async () => {
      const { service, productRepo } = buildService();
      productRepo.findOne.mockResolvedValue(product);

      await expect(service[method]('x')).resolves.toBe(product);
      expect(productRepo.findOne).toHaveBeenCalledWith({
        where,
        relations: ['images', 'variants', 'tags', 'category'],
      });
    });

    it('throws NotFoundException when missing', async () => {
      const { service } = buildService();

      await expect(service[method]('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('regenerates the slug when the name changes without an explicit slug', async () => {
      const ctx = buildService();
      withExistingProduct(ctx.productRepo);

      const result = await ctx.service.update('product-1', {
        name: 'Quần jean',
      });

      expect(result).toEqual(
        expect.objectContaining({ name: 'Quần jean', slug: 'quan-jean' }),
      );
    });

    it('uses an explicit slug over a regenerated one', async () => {
      const ctx = buildService();
      withExistingProduct(ctx.productRepo);

      const result = await ctx.service.update('product-1', {
        name: 'Quần jean',
        slug: 'custom',
      });

      expect(result.slug).toBe('custom');
      expect(ctx.productRepo.exists).not.toHaveBeenCalled();
    });

    it('rejects a slug or SKU taken by another product', async () => {
      const ctx = buildService();
      ctx.productRepo.findOne
        .mockResolvedValueOnce({ ...product })
        .mockResolvedValueOnce({ id: 'other' });

      await expect(
        ctx.service.update('product-1', { slug: 'taken' }),
      ).rejects.toThrow(ConflictException);

      ctx.productRepo.findOne
        .mockResolvedValueOnce({ ...product })
        .mockResolvedValueOnce({ id: 'other' });

      await expect(
        ctx.service.update('product-1', { sku: 'SKU-2' }),
      ).rejects.toThrow(ConflictException);
    });

    it('replaces tags and scalar fields', async () => {
      const ctx = buildService();
      withExistingProduct(ctx.productRepo);
      ctx.tagRepo.find.mockResolvedValue([{ id: 'tag-1' }]);

      const result = await ctx.service.update('product-1', {
        tagIds: ['tag-1'],
        category_id: 'cat-2',
        description: 'desc',
        basePrice: 200,
        status: ProductStatus.PUBLISHED,
        isFeatured: true,
      });

      expect(result).toEqual(
        expect.objectContaining({
          slug: 'ao-thun',
          tags: [{ id: 'tag-1' }],
          category_id: 'cat-2',
          description: 'desc',
          basePrice: 200,
          status: ProductStatus.PUBLISHED,
          isFeatured: true,
        }),
      );
    });

    it('clears tags with an empty list', async () => {
      const ctx = buildService();
      withExistingProduct(ctx.productRepo, { ...product, tags: [{ id: 't' }] });

      const result = await ctx.service.update('product-1', { tagIds: [] });

      expect(result.tags).toEqual([]);
      expect(ctx.tagRepo.find).not.toHaveBeenCalled();
    });
  });

  it('remove deletes the product', async () => {
    const { service, productRepo } = buildService();
    productRepo.findOne.mockResolvedValue(product);

    await expect(service.remove('product-1')).resolves.toEqual({
      success: true,
    });
    expect(productRepo.remove).toHaveBeenCalledWith(product);
  });

  describe('images', () => {
    it('addImage unsets other primary images first', async () => {
      const { service, productRepo, imageRepo } = buildService();
      productRepo.findOne.mockResolvedValue(product);

      await service.addImage('product-1', {
        url: 'https://img',
        isPrimary: true,
      });

      expect(imageRepo.update).toHaveBeenCalledWith(
        { product_id: 'product-1' },
        { isPrimary: false },
      );
      expect(imageRepo.save).toHaveBeenCalledWith({
        url: 'https://img',
        isPrimary: true,
        product_id: 'product-1',
      });
    });

    it('addImage leaves other images alone for a non-primary image', async () => {
      const { service, productRepo, imageRepo } = buildService();
      productRepo.findOne.mockResolvedValue(product);

      await service.addImage('product-1', { url: 'https://img' });

      expect(imageRepo.update).not.toHaveBeenCalled();
    });

    it('addImage rejects an unknown product', async () => {
      const { service, imageRepo } = buildService();

      await expect(service.addImage('x', { url: 'u' })).rejects.toThrow(
        NotFoundException,
      );
      expect(imageRepo.save).not.toHaveBeenCalled();
    });

    it('uploadImage stores the uploaded file with defaults', async () => {
      const { service, productRepo, imageRepo, mediaService } = buildService();
      productRepo.findOne.mockResolvedValue(product);
      const file = { originalname: 'x.png' };

      await service.uploadImage('product-1', file as never);

      expect(mediaService.uploadOne).toHaveBeenCalledWith(
        file,
        'products/product-1',
      );
      expect(imageRepo.update).not.toHaveBeenCalled();
      expect(imageRepo.save).toHaveBeenCalledWith({
        product_id: 'product-1',
        variant_id: null,
        url: 'https://cdn/x.png',
        publicId: 'p/x',
        alt: null,
        isPrimary: false,
        sortOrder: 0,
      });
    });

    it('uploadImage applies options and resets other primaries', async () => {
      const { service, productRepo, imageRepo } = buildService();
      productRepo.findOne.mockResolvedValue(product);

      await service.uploadImage('product-1', {} as never, {
        alt: 'front',
        isPrimary: true,
        sortOrder: 2,
        variant_id: 'v-1',
      });

      expect(imageRepo.update).toHaveBeenCalled();
      expect(imageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          alt: 'front',
          isPrimary: true,
          sortOrder: 2,
          variant_id: 'v-1',
        }),
      );
    });

    it('removeImage deletes the cloud asset and the row', async () => {
      const { service, imageRepo, mediaService } = buildService();
      const image = { id: 'img-1', publicId: 'p/x' };
      imageRepo.findOne.mockResolvedValue(image);

      await expect(service.removeImage('product-1', 'img-1')).resolves.toEqual({
        success: true,
      });
      expect(imageRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'img-1', product_id: 'product-1' },
      });
      expect(mediaService.delete).toHaveBeenCalledWith('p/x');
      expect(imageRepo.remove).toHaveBeenCalledWith(image);
    });

    it('removeImage still removes the row when cloud deletion fails', async () => {
      const { service, imageRepo, mediaService } = buildService();
      imageRepo.findOne.mockResolvedValue({ id: 'img-1', publicId: 'p/x' });
      mediaService.delete.mockRejectedValue(new Error('cdn'));

      await service.removeImage('product-1', 'img-1');

      expect(imageRepo.remove).toHaveBeenCalled();
      expect(jest.spyOn(service['logger'], 'warn')).toHaveBeenCalled();
    });

    it('removeImage skips the CDN for images without publicId', async () => {
      const { service, imageRepo, mediaService } = buildService();
      imageRepo.findOne.mockResolvedValue({ id: 'img-1', publicId: null });

      await service.removeImage('product-1', 'img-1');

      expect(mediaService.delete).not.toHaveBeenCalled();
    });

    it('removeImage rejects an image of another product', async () => {
      const { service } = buildService();

      await expect(service.removeImage('product-1', 'x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('variants', () => {
    it('addVariant links the variant to the product', async () => {
      const { service, productRepo, variantRepo } = buildService();
      productRepo.findOne.mockResolvedValue(product);

      await service.addVariant('product-1', { sku: 'V-1' } as never);

      expect(variantRepo.save).toHaveBeenCalledWith({
        sku: 'V-1',
        product_id: 'product-1',
      });
    });

    it('addVariant rejects a duplicate SKU', async () => {
      const { service, productRepo, variantRepo } = buildService();
      productRepo.findOne.mockResolvedValue(product);
      variantRepo.findOne.mockResolvedValue({ id: 'v' });

      await expect(
        service.addVariant('product-1', { sku: 'V-1' } as never),
      ).rejects.toThrow(ConflictException);
    });

    it('updateVariant updates a variant of the product', async () => {
      const { service, variantRepo } = buildService();
      variantRepo.findOne.mockResolvedValueOnce({
        id: 'v-1',
        sku: 'V-1',
        stock: 1,
      });

      await expect(
        service.updateVariant('product-1', 'v-1', { stock: 5 }),
      ).resolves.toEqual({ id: 'v-1', sku: 'V-1', stock: 5 });
      expect(variantRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'v-1', product_id: 'product-1' },
      });
    });

    it('updateVariant checks a changed SKU', async () => {
      const { service, variantRepo } = buildService();
      variantRepo.findOne
        .mockResolvedValueOnce({ id: 'v-1', sku: 'V-1' })
        .mockResolvedValueOnce({ id: 'v-2' });

      await expect(
        service.updateVariant('product-1', 'v-1', { sku: 'V-2' }),
      ).rejects.toThrow(ConflictException);
    });

    it.each(['updateVariant', 'removeVariant'] as const)(
      '%s rejects an unknown variant',
      async (method) => {
        const { service } = buildService();

        await expect(
          (service[method] as (...a: unknown[]) => Promise<unknown>)(
            'product-1',
            'x',
            {},
          ),
        ).rejects.toThrow(NotFoundException);
      },
    );

    it('removeVariant removes the variant', async () => {
      const { service, variantRepo } = buildService();
      const variant = { id: 'v-1' };
      variantRepo.findOne.mockResolvedValue(variant);

      await expect(service.removeVariant('product-1', 'v-1')).resolves.toEqual({
        success: true,
      });
      expect(variantRepo.remove).toHaveBeenCalledWith(variant);
    });
  });

  describe('tags', () => {
    it('createTag generates a slug', async () => {
      const { service, tagRepo } = buildService();

      await expect(service.createTag({ name: 'Giảm giá' })).resolves.toEqual({
        name: 'Giảm giá',
        slug: 'giam-gia',
      });
      expect(tagRepo.exists).toHaveBeenCalledWith({
        where: { slug: 'giam-gia' },
      });
    });

    it('createTag uses an explicit slug', async () => {
      const { service } = buildService();

      await expect(
        service.createTag({ name: 'Sale', slug: 'hot' }),
      ).resolves.toEqual({ name: 'Sale', slug: 'hot' });
    });

    it('createTag rejects a duplicate name', async () => {
      const { service, tagRepo } = buildService();
      tagRepo.findOne.mockResolvedValueOnce({ id: 't' });

      await expect(service.createTag({ name: 'Sale' })).rejects.toThrow(
        'Tag name already exists',
      );
    });

    it('createTag rejects a duplicate slug', async () => {
      const { service, tagRepo } = buildService();
      tagRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 't' });

      await expect(
        service.createTag({ name: 'Sale', slug: 'hot' }),
      ).rejects.toThrow('Tag slug already exists');
    });

    it('findAllTags sorts by name', async () => {
      const { service, tagRepo } = buildService();

      await service.findAllTags();

      expect(tagRepo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
    });

    it('findTagBySlug throws NotFoundException when missing', async () => {
      const { service } = buildService();

      await expect(service.findTagBySlug('x')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('removeTag removes an existing tag', async () => {
      const { service, tagRepo } = buildService();
      tagRepo.findOne.mockResolvedValue({ id: 't' });

      await expect(service.removeTag('t')).resolves.toEqual({ success: true });
      expect(tagRepo.remove).toHaveBeenCalledWith({ id: 't' });
    });

    it('removeTag throws NotFoundException when missing', async () => {
      const { service } = buildService();

      await expect(service.removeTag('x')).rejects.toThrow(NotFoundException);
    });
  });
});
