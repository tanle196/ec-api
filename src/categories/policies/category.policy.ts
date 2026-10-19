import { ConflictException, Injectable } from '@nestjs/common';

// Business rules for categories. Lookups, uniqueness checks and not-found
// checks (including a missing parent) stay in CategoriesService.
@Injectable()
export class CategoryPolicy {
  assertNotOwnParent(id: string, parentId: string | null): void {
    if (parentId === id)
      throw new ConflictException('A category cannot be its own parent');
  }

  assertCanDelete(childCount: number): void {
    if (childCount > 0)
      throw new ConflictException('Cannot delete a category that has children');
  }
}
