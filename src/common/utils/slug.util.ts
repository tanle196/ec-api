import slugify from 'slugify';
import { customAlphabet } from 'nanoid';

// Alphabet an toàn cho URL, không ký tự dễ nhầm
const randomSuffix = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

const MAX_SLUG_LENGTH = 80;
const MIN_SLUG_LENGTH = 3;
const MAX_UNIQUE_ATTEMPTS = 30;

/**
 * Sinh slug từ chuỗi bất kỳ, phòng thủ các case:
 * - Tiếng Việt có dấu, chữ "đ" (locale vi)
 * - Input rỗng / toàn khoảng trắng
 * - Input toàn emoji / CJK / ký tự lạ → slugify ra rỗng
 * - Input quá dài → cắt tại ranh giới từ
 * - Dấu gạch thừa ở đầu/cuối, gạch lặp
 */
export function generateSlug(input: string, fallbackPrefix = 'item'): string {
  const cleaned = (input ?? '').trim();

  let slug = slugify(cleaned, {
    lower: true,
    strict: true, // chỉ giữ a-z, 0-9, dấu gạch
    locale: 'vi', // đ → d, xử lý dấu tiếng Việt đúng
    trim: true,
  });

  // strict đã lọc ký tự lạ, nhưng vẫn dọn gạch lặp/gạch mép cho chắc
  slug = slug.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');

  // Quá dài → cắt tại dấu gạch gần nhất để không đứt giữa từ
  if (slug.length > MAX_SLUG_LENGTH) {
    slug = slug.slice(0, MAX_SLUG_LENGTH);
    const lastDash = slug.lastIndexOf('-');
    if (lastDash > MIN_SLUG_LENGTH) slug = slug.slice(0, lastDash);
  }

  // Rỗng hoặc quá ngắn (tên toàn emoji, "!!!", v.v.) → fallback random
  if (slug.length < MIN_SLUG_LENGTH) {
    slug = `${fallbackPrefix}-${randomSuffix()}`;
  }

  return slug;
}

/**
 * Sinh slug unique. Nhận hàm check tồn tại thay vì repository
 * để dùng chung cho mọi entity và dễ viết unit test.
 *
 * Ví dụ với TypeORM:
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

  // Thử hậu tố đếm: ao-thun-2, ao-thun-3...
  for (let i = 2; i <= MAX_UNIQUE_ATTEMPTS; i++) {
    const suffix = `-${i}`;
    // Đảm bảo base + suffix không vượt max length
    const candidate = base.slice(0, MAX_SLUG_LENGTH - suffix.length) + suffix;
    if (!(await exists(candidate))) return candidate;
  }

  // Trùng quá nhiều (hiếm) → hậu tố random, gần như chắc chắn unique
  const suffix = `-${randomSuffix()}`;
  return base.slice(0, MAX_SLUG_LENGTH - suffix.length) + suffix;
}

/**
 * Nhận diện lỗi vi phạm unique constraint của Postgres (code 23505).
 * Dùng để retry khi 2 request tạo trùng slug cùng lúc (race condition).
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}
