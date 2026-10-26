import {
  CategoryResponseDto,
  CategoryTreeNodeDto,
} from '../dto/category-response.dto';
import { Category } from '../entities/category.entity';

export class CategoryMapper {
  // imagePublicId is a storage-provider internal and is intentionally not exposed.
  static toResponse = (entity: Category): CategoryResponseDto => ({
    id: entity.id,
    parent_id: entity.parent_id,
    name: entity.name,
    slug: entity.slug,
    description: entity.description,
    image: entity.image,
    sortOrder: entity.sortOrder,
    isActive: entity.isActive,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  });

  static toResponseList = (entities: Category[]): CategoryResponseDto[] =>
    entities.map(CategoryMapper.toResponse);

  static toTreeNode = (
    entity: Category,
    children: CategoryTreeNodeDto[],
  ): CategoryTreeNodeDto => ({
    ...CategoryMapper.toResponse(entity),
    children,
  });
}
