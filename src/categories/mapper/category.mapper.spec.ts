import { CategoryMapper } from './category.mapper';

describe('CategoryMapper', () => {
  const createdAt = new Date('2026-01-01');
  const category = {
    id: 'cat-1',
    parent_id: null,
    parent: null,
    children: [{ id: 'cat-2' }],
    name: 'Áo',
    slug: 'ao',
    description: null,
    image: 'https://cdn/ao.png',
    imagePublicId: 'categories/ao',
    sortOrder: 0,
    isActive: true,
    createdAt,
    updatedAt: createdAt,
  };
  const expected = {
    id: 'cat-1',
    parent_id: null,
    name: 'Áo',
    slug: 'ao',
    description: null,
    image: 'https://cdn/ao.png',
    sortOrder: 0,
    isActive: true,
    createdAt,
    updatedAt: createdAt,
  };

  it('drops imagePublicId and relations', () => {
    expect(CategoryMapper.toResponse(category as never)).toEqual(expected);
  });

  it('toTreeNode attaches the given children', () => {
    expect(CategoryMapper.toTreeNode(category as never, [])).toEqual({
      ...expected,
      children: [],
    });
  });
});
