import {
  generateSlug,
  generateUniqueSlug,
  isUniqueViolation,
} from './slug.util';

describe('slug.util', () => {
  describe('generateSlug', () => {
    it('lowercases and dasherizes ASCII input', () => {
      expect(generateSlug('Hello World')).toBe('hello-world');
    });

    it('strips Vietnamese diacritics and converts đ to d', () => {
      expect(generateSlug('Áo thun đẹp')).toBe('ao-thun-dep');
    });

    it('drops special characters and collapses dashes', () => {
      expect(generateSlug('  --Áo   thun!!! -- nam--  ')).toBe('ao-thun-nam');
    });

    it('falls back to a random slug for empty input', () => {
      expect(generateSlug('')).toMatch(/^item-[a-z0-9]{8}$/);
    });

    it('falls back to a random slug when nothing survives slugify', () => {
      expect(generateSlug('!!!', 'product')).toMatch(/^product-[a-z0-9]{8}$/);
    });

    it('falls back when the slug is shorter than 3 chars', () => {
      expect(generateSlug('ab')).toMatch(/^item-[a-z0-9]{8}$/);
    });

    it('handles null/undefined input', () => {
      expect(generateSlug(undefined as never)).toMatch(/^item-/);
    });

    it('truncates long input at a word boundary within 80 chars', () => {
      const input = Array.from({ length: 30 }, () => 'word').join(' ');
      const slug = generateSlug(input);

      expect(slug.length).toBeLessThanOrEqual(80);
      expect(slug.endsWith('-')).toBe(false);
      expect(slug.split('-').every((w) => w === 'word')).toBe(true);
    });

    it('hard-truncates a long input without dashes', () => {
      expect(generateSlug('a'.repeat(120))).toBe('a'.repeat(80));
    });
  });

  describe('generateUniqueSlug', () => {
    it('returns the base slug when it is free', async () => {
      const exists = jest.fn().mockResolvedValue(false);

      await expect(generateUniqueSlug('Áo thun', exists)).resolves.toBe(
        'ao-thun',
      );
      expect(exists).toHaveBeenCalledTimes(1);
    });

    it('appends a counter suffix on collision', async () => {
      const taken = new Set(['ao-thun', 'ao-thun-2']);
      const exists = jest.fn((s: string) => Promise.resolve(taken.has(s)));

      await expect(generateUniqueSlug('Áo thun', exists)).resolves.toBe(
        'ao-thun-3',
      );
    });

    it('keeps suffixed slugs within 80 chars', async () => {
      const base = 'a'.repeat(80);
      const exists = jest.fn((s: string) => Promise.resolve(s === base));

      const slug = await generateUniqueSlug(base, exists);

      expect(slug).toBe(`${'a'.repeat(78)}-2`);
    });

    it('falls back to a random suffix after too many collisions', async () => {
      const exists = jest.fn().mockResolvedValue(true);

      const slug = await generateUniqueSlug('Áo thun', exists);

      expect(slug).toMatch(/^ao-thun-[a-z0-9]{8}$/);
      // base + attempts 2..30
      expect(exists).toHaveBeenCalledTimes(30);
    });
  });

  describe('isUniqueViolation', () => {
    it('detects Postgres code 23505', () => {
      expect(isUniqueViolation({ code: '23505' })).toBe(true);
    });

    it.each([
      [{ code: '23503' }],
      [new Error('boom')],
      [null],
      [undefined],
      ['23505'],
    ])('returns false for %p', (error) => {
      expect(isUniqueViolation(error)).toBe(false);
    });
  });
});
