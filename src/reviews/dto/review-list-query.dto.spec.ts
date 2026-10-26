import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReviewListQueryDto } from './review-list-query.dto';

describe('ReviewListQueryDto', () => {
  const parse = (query: Record<string, unknown>) =>
    plainToInstance(ReviewListQueryDto, query);

  it.each([
    ['true', true],
    ['false', false],
  ])('parses isApproved/isVerified=%p as %p', async (raw, expected) => {
    const dto = parse({ isApproved: raw, isVerified: raw });

    expect(dto.isApproved).toBe(expected);
    expect(dto.isVerified).toBe(expected);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('leaves the flags undefined when absent', () => {
    const dto = parse({});

    expect(dto.isApproved).toBeUndefined();
    expect(dto.isVerified).toBeUndefined();
  });

  it('rejects non-boolean values instead of coercing them to true', async () => {
    const errors = await validate(
      parse({ isApproved: 'yes', isVerified: '1' }),
    );

    expect(errors.map((e) => e.property).sort()).toEqual([
      'isApproved',
      'isVerified',
    ]);
  });

  it('coerces numeric pagination and rating', async () => {
    const dto = parse({ page: '2', limit: '10', rating: '5' });

    expect(dto).toEqual(
      expect.objectContaining({ page: 2, limit: 10, rating: 5 }),
    );
    expect(await validate(dto)).toHaveLength(0);
  });
});
