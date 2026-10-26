import slugify from 'slugify';
import { customAlphabet } from 'nanoid';

// URL-safe alphabet, avoids easily confused characters
const randomSuffix = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

const MAX_SLUG_LENGTH = 80;
const MIN_SLUG_LENGTH = 3;
const MAX_UNIQUE_ATTEMPTS = 30;

/**
 * Generates a slug from any string, guarding against:
 * - Vietnamese diacritics and the "đ" character (locale vi)
 * - Empty / whitespace-only input
 * - Input that's all emoji / CJK / unusual characters → slugify returns empty
 * - Input too long → truncate at a word boundary
 * - Leading/trailing dashes, repeated dashes
 */
export function generateSlug(input: string, fallbackPrefix = 'item'): string {
  const cleaned = (input ?? '').trim();

  let slug = slugify(cleaned, {
    lower: true,
    strict: true, // keep only a-z, 0-9, dashes
    locale: 'vi', // đ → d, handles Vietnamese diacritics correctly
    trim: true,
  });

  // strict already filters unusual characters, but clean up repeated/edge dashes just in case
  slug = slug.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');

  // Too long → truncate at the nearest dash to avoid cutting a word in half
  if (slug.length > MAX_SLUG_LENGTH) {
    slug = slug.slice(0, MAX_SLUG_LENGTH);
    const lastDash = slug.lastIndexOf('-');
    if (lastDash > MIN_SLUG_LENGTH) slug = slug.slice(0, lastDash);
  }

  // Empty or too short (name is all emoji, "!!!", etc.) → random fallback
  if (slug.length < MIN_SLUG_LENGTH) {
    slug = `${fallbackPrefix}-${randomSuffix()}`;
  }

  return slug;
}

/**
 * Generates a unique slug. Takes an existence-check function instead of a
 * repository so it can be shared across entities and unit tested easily.
 *
 * Example with TypeORM:
 *   const slug = await generateUniqueSlug(name, (s) =>
 *     this.productRepo.exists({ where: { slug: s } }),
 *   );
 */
export async function generateUniqueSlug(
  input: string,
  exists: (slug: string) => Promise<boolean>,
  fallbackPrefix = 'item',
): Promise<string> {
  const base = generateSlug(input, fallbackPrefix);

  if (!(await exists(base))) return base;

  // Try a counter suffix: ao-thun-2, ao-thun-3...
  for (let i = 2; i <= MAX_UNIQUE_ATTEMPTS; i++) {
    const suffix = `-${i}`;
    // Ensure base + suffix doesn't exceed max length
    const candidate = base.slice(0, MAX_SLUG_LENGTH - suffix.length) + suffix;
    if (!(await exists(candidate))) return candidate;
  }

  // Too many collisions (rare) → random suffix, virtually guaranteed unique
  const suffix = `-${randomSuffix()}`;
  return base.slice(0, MAX_SLUG_LENGTH - suffix.length) + suffix;
}

/**
 * Detects a Postgres unique constraint violation (code 23505).
 * Used to retry when two requests generate the same slug concurrently (race condition).
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}
