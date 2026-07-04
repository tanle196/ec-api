import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, IsNull, Not, Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryListQueryDto } from './dto/category-list-query.dto';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import {
  CategoryResponseDto,
  CategoryTreeNodeDto,
} from './dto/category-response.dto';
import { MediaService } from '@/media/media.service';
import { generateUniqueSlug } from '@/common/utils/slug.util';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @InjectRepository(Category)
    private readonly repo: Repository<Category>,
    private readonly mediaService: MediaService,
  ) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    let slug: string;
    if (dto.slug) {
      const existing = await this.repo.findOne({ where: { slug: dto.slug } });
      if (existing) {
        throw new ConflictException(`Slug '${dto.slug}' already exists`);
      }
      slug = dto.slug;
    } else {
      slug = await generateUniqueSlug(
        dto.name,
        (s) => this.repo.exists({ where: { slug: s } }),
        'category',
      );
    }

    if (dto.parent_id) {
      const parent = await this.repo.findOne({ where: { id: dto.parent_id } });
      if (!parent) {
        throw new NotFoundException(
          `Parent category '${dto.parent_id}' not found`,
        );
      }
    }

    const category = this.repo.create({
      name: dto.name,
      slug,
      parent_id: dto.parent_id ?? null,
      description: dto.description ?? null,
      image: dto.image ?? null,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    return this.repo.save(category);
  }

  async findAll(
    query: CategoryListQueryDto,
  ): Promise<PaginatedResponseDto<CategoryResponseDto>> {
    const { page = 1, limit = 20, name, parent_id, isActive } = query;

    const where: Record<string, unknown> = {};
    if (name) where.name = ILike(`%${name}%`);
    if (parent_id !== undefined) where.parent_id = parent_id;
    if (isActive !== undefined) where.isActive = isActive;

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data: items, total, page, limit };
  }

  async findOne(id: string): Promise<Category> {
    const category = await this.repo.findOne({
      where: { id },
      relations: ['parent', 'children'],
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async findTree(): Promise<CategoryTreeNodeDto[]> {
    const roots = await this.repo.find({
      where: { parent_id: IsNull() },
      order: { sortOrder: 'ASC' },
    });

    return Promise.all(roots.map((r) => this.buildTreeNode(r)));
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);

    if (dto.slug && dto.slug !== category.slug) {
      const conflict = await this.repo.findOne({ where: { slug: dto.slug } });
      if (conflict) {
        throw new ConflictException(`Slug '${dto.slug}' already exists`);
      }
    }

    if (dto.parent_id !== undefined && dto.parent_id !== category.parent_id) {
      if (dto.parent_id === id) {
        throw new ConflictException('A category cannot be its own parent');
      }
      if (dto.parent_id) {
        const parent = await this.repo.findOne({
          where: { id: dto.parent_id },
        });
        if (!parent) {
          throw new NotFoundException(
            `Parent category '${dto.parent_id}' not found`,
          );
        }
      }
    }

    if (dto.name !== undefined) category.name = dto.name;
    if (dto.slug !== undefined) category.slug = dto.slug;
    else if (dto.name !== undefined)
      category.slug = await generateUniqueSlug(
        dto.name,
        (s) => this.repo.exists({ where: { slug: s, id: Not(id) } }),
        'category',
      );
    if (dto.parent_id !== undefined) category.parent_id = dto.parent_id ?? null;
    if (dto.description !== undefined)
      category.description = dto.description ?? null;
    if (dto.image !== undefined) category.image = dto.image ?? null;
    if (dto.sortOrder !== undefined) category.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) category.isActive = dto.isActive;

    return this.repo.save(category);
  }

  async uploadImage(id: string, file: Express.Multer.File): Promise<Category> {
    const category = await this.findOne(id);

    // Delete old cloud image before replacing
    if (category.imagePublicId) {
      try {
        await this.mediaService.delete(category.imagePublicId);
      } catch (err) {
        this.logger.warn(
          `Could not delete old cloud asset ${category.imagePublicId}: ${err}`,
        );
      }
    }

    const result = await this.mediaService.uploadOne(file, `categories/${id}`);
    category.image = result.url;
    category.imagePublicId = result.publicId;
    return this.repo.save(category);
  }

  async removeImage(id: string): Promise<Category> {
    const category = await this.findOne(id);

    if (category.imagePublicId) {
      try {
        await this.mediaService.delete(category.imagePublicId);
      } catch (err) {
        this.logger.warn(
          `Could not delete cloud asset ${category.imagePublicId}: ${err}`,
        );
      }
    }

    category.image = null;
    category.imagePublicId = null;
    return this.repo.save(category);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const category = await this.findOne(id);

    const hasChildren = await this.repo.count({ where: { parent_id: id } });
    if (hasChildren > 0) {
      throw new ConflictException('Cannot delete a category that has children');
    }

    await this.repo.remove(category);
    return { success: true };
  }

  private async buildTreeNode(
    category: Category,
  ): Promise<CategoryTreeNodeDto> {
    const children = await this.repo.find({
      where: { parent_id: category.id },
      order: { sortOrder: 'ASC' },
    });

    return {
      ...category,
      children: await Promise.all(children.map((c) => this.buildTreeNode(c))),
    };
  }
}
