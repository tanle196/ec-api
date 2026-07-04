import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { Tag } from './entities/tag.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductListQueryDto } from './dto/product-list-query.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { CreateTagDto } from './dto/create-tag.dto';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { ProductListItemDto } from './dto/product-response.dto';
import { ProductStatus } from './enums/product-status.enum';
import { MediaService } from '@/media/media.service';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductImage)
    private readonly imageRepo: Repository<ProductImage>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Tag)
    private readonly tagRepo: Repository<Tag>,
    private readonly mediaService: MediaService,
  ) {}

  // ── Products ───────────────────────────────────────────────

  async create(dto: CreateProductDto): Promise<Product> {
    const slug = dto.slug ?? this.toSlug(dto.name);
    await this.assertSlugUnique(slug);
    await this.assertSkuUnique(dto.sku);

    if (dto.variants?.length) {
      for (const v of dto.variants) await this.assertVariantSkuUnique(v.sku);
    }

    let tags: Tag[] = [];
    if (dto.tagIds?.length) tags = await this.resolveTagsByIds(dto.tagIds);

    const product = this.productRepo.create({
      category_id: dto.category_id,
      name: dto.name,
      slug,
      description: dto.description ?? null,
      basePrice: dto.basePrice,
      sku: dto.sku,
      status: dto.status ?? ProductStatus.DRAFT,
      isFeatured: dto.isFeatured ?? false,
      tags,
    });

    const saved = await this.productRepo.save(product);

    if (dto.images?.length) {
      await this.imageRepo.save(
        dto.images.map((img) =>
          this.imageRepo.create({ ...img, product_id: saved.id }),
        ),
      );
    }

    if (dto.variants?.length) {
      await this.variantRepo.save(
        dto.variants.map((v) =>
          this.variantRepo.create({ ...v, product_id: saved.id }),
        ),
      );
    }

    return this.findOne(saved.id);
  }

  async findAll(
    query: ProductListQueryDto,
  ): Promise<PaginatedResponseDto<ProductListItemDto>> {
    const {
      page = 1,
      limit = 20,
      name,
      category_id,
      status,
      isFeatured,
    } = query;

    const qb = this.productRepo.createQueryBuilder('p');

    if (name) qb.andWhere('p.name ILIKE :name', { name: `%${name}%` });
    if (category_id)
      qb.andWhere('p.category_id = :category_id', { category_id });
    if (status) qb.andWhere('p.status = :status', { status });
    if (isFeatured !== undefined)
      qb.andWhere('p.isFeatured = :isFeatured', { isFeatured });

    const [data, total] = await qb
      .orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['images', 'variants', 'tags', 'category'],
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);

    if (dto.slug && dto.slug !== product.slug)
      await this.assertSlugUnique(dto.slug);
    if (dto.sku && dto.sku !== product.sku) await this.assertSkuUnique(dto.sku);

    if (dto.tagIds !== undefined)
      product.tags = await this.resolveTagsByIds(dto.tagIds);

    if (dto.name !== undefined) {
      product.name = dto.name;
      if (!dto.slug) product.slug = this.toSlug(dto.name);
    }
    if (dto.slug !== undefined) product.slug = dto.slug;
    if (dto.category_id !== undefined) product.category_id = dto.category_id;
    if (dto.description !== undefined)
      product.description = dto.description ?? null;
    if (dto.basePrice !== undefined) product.basePrice = dto.basePrice;
    if (dto.sku !== undefined) product.sku = dto.sku;
    if (dto.status !== undefined) product.status = dto.status;
    if (dto.isFeatured !== undefined) product.isFeatured = dto.isFeatured;

    return this.productRepo.save(product);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const product = await this.findOne(id);
    await this.productRepo.remove(product);
    return { success: true };
  }

  // ── Images ────────────────────────────────────────────────

  async addImage(
    productId: string,
    dto: CreateProductImageDto,
  ): Promise<ProductImage> {
    await this.findOne(productId);

    if (dto.isPrimary) {
      await this.imageRepo.update(
        { product_id: productId },
        { isPrimary: false },
      );
    }

    return this.imageRepo.save(
      this.imageRepo.create({ ...dto, product_id: productId }),
    );
  }

  async uploadImage(
    productId: string,
    file: Express.Multer.File,
    opts?: {
      alt?: string;
      isPrimary?: boolean;
      sortOrder?: number;
      variant_id?: string;
    },
  ): Promise<ProductImage> {
    await this.findOne(productId);

    const result = await this.mediaService.uploadOne(
      file,
      `products/${productId}`,
    );

    if (opts?.isPrimary) {
      await this.imageRepo.update(
        { product_id: productId },
        { isPrimary: false },
      );
    }

    return this.imageRepo.save(
      this.imageRepo.create({
        product_id: productId,
        variant_id: opts?.variant_id ?? null,
        url: result.url,
        publicId: result.publicId,
        alt: opts?.alt ?? null,
        isPrimary: opts?.isPrimary ?? false,
        sortOrder: opts?.sortOrder ?? 0,
      }),
    );
  }

  async removeImage(
    productId: string,
    imageId: string,
  ): Promise<{ success: boolean }> {
    const image = await this.imageRepo.findOne({
      where: { id: imageId, product_id: productId },
    });
    if (!image) throw new NotFoundException('Image not found');

    if (image.publicId) {
      try {
        await this.mediaService.delete(image.publicId);
      } catch (err) {
        this.logger.warn(
          `Could not delete cloud asset ${image.publicId}: ${err}`,
        );
      }
    }

    await this.imageRepo.remove(image);
    return { success: true };
  }

  // ── Variants ──────────────────────────────────────────────

  async addVariant(
    productId: string,
    dto: CreateProductVariantDto,
  ): Promise<ProductVariant> {
    await this.findOne(productId);
    await this.assertVariantSkuUnique(dto.sku);
    return this.variantRepo.save(
      this.variantRepo.create({ ...dto, product_id: productId }),
    );
  }

  async updateVariant(
    productId: string,
    variantId: string,
    dto: UpdateProductVariantDto,
  ): Promise<ProductVariant> {
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, product_id: productId },
    });
    if (!variant) throw new NotFoundException('Variant not found');

    if (dto.sku && dto.sku !== variant.sku)
      await this.assertVariantSkuUnique(dto.sku);

    Object.assign(variant, dto);
    return this.variantRepo.save(variant);
  }

  async removeVariant(
    productId: string,
    variantId: string,
  ): Promise<{ success: boolean }> {
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, product_id: productId },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    await this.variantRepo.remove(variant);
    return { success: true };
  }

  // ── Tags ──────────────────────────────────────────────────

  async createTag(dto: CreateTagDto): Promise<Tag> {
    const slug = dto.slug ?? this.toSlug(dto.name);

    const existing = await this.tagRepo.findOne({
      where: [{ name: dto.name }, { slug }],
    });
    if (existing)
      throw new ConflictException('Tag name or slug already exists');

    return this.tagRepo.save(this.tagRepo.create({ name: dto.name, slug }));
  }

  async findAllTags(): Promise<Tag[]> {
    return this.tagRepo.find({ order: { name: 'ASC' } });
  }

  async removeTag(tagId: string): Promise<{ success: boolean }> {
    const tag = await this.tagRepo.findOne({ where: { id: tagId } });
    if (!tag) throw new NotFoundException('Tag not found');
    await this.tagRepo.remove(tag);
    return { success: true };
  }

  // ── Helpers ───────────────────────────────────────────────

  private async resolveTagsByIds(tagIds: string[]): Promise<Tag[]> {
    if (!tagIds.length) return [];
    const tags = await this.tagRepo.find({ where: { id: In(tagIds) } });
    const missing = tagIds.filter((id) => !tags.find((t) => t.id === id));
    if (missing.length)
      throw new NotFoundException(`Tags not found: ${missing.join(', ')}`);
    return tags;
  }

  private async assertSlugUnique(slug: string): Promise<void> {
    const exists = await this.productRepo.findOne({ where: { slug } });
    if (exists) throw new ConflictException(`Slug '${slug}' already exists`);
  }

  private async assertSkuUnique(sku: string): Promise<void> {
    const exists = await this.productRepo.findOne({ where: { sku } });
    if (exists) throw new ConflictException(`SKU '${sku}' already exists`);
  }

  private async assertVariantSkuUnique(sku: string): Promise<void> {
    const exists = await this.variantRepo.findOne({ where: { sku } });
    if (exists)
      throw new ConflictException(`Variant SKU '${sku}' already exists`);
  }

  private toSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }
}
