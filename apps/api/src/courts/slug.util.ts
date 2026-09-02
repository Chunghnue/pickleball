export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const COMBINING_MARK_MIN = 0x0300;
const COMBINING_MARK_MAX = 0x036f;

export function slugify(input: string): string {
  const withoutCombiningMarks = Array.from(input.normalize('NFD'))
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code < COMBINING_MARK_MIN || code > COMBINING_MARK_MAX;
    })
    .join('');
  return withoutCombiningMarks
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
