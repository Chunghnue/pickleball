import { slugify } from './slug.util';

describe('slugify', () => {
  it('lowercases and hyphenates a plain ASCII name', () => {
    expect(slugify('ABC Pickleball Club')).toBe('abc-pickleball-club');
  });

  it('strips Vietnamese diacritics, including đ', () => {
    expect(slugify('Sân Đình Văn Chung')).toBe('san-dinh-van-chung');
  });

  it('collapses repeated separators and trims leading/trailing hyphens', () => {
    expect(slugify('  Quận 1 -- Chi nhánh!!  ')).toBe('quan-1-chi-nhanh');
  });
});
