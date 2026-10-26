import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CategoryListQueryDto } from './category-list-query.dto';

describe('CategoryListQueryDto', () => {
  const parse = (query: Record<string, unknown>) =>
    plainToInstance(CategoryListQueryDto, query);

  it('applies pagination defaults', async () => {
    const dto = parse({});

    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('coerces query-string page/limit', async () => {
    const dto = parse({ page: '2', limit: '50' });

    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('parses isActive=%p as %p', (raw, expected) => {
    expect(parse({ isActive: raw }).isActive).toBe(expected);
  });

  it('rejects limit above 100 and a non-uuid parent_id', async () => {
    const errors = await validate(parse({ limit: '101', parent_id: 'abc' }));

    expect(errors.map((e) => e.property).sort()).toEqual([
      'limit',
      'parent_id',
    ]);
  });
});
