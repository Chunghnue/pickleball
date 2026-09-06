import { computeReadingMinutes } from './reading-time.util';

describe('computeReadingMinutes', () => {
  it('returns 1 minute for empty or very short content', () => {
    expect(computeReadingMinutes('')).toBe(1);
    expect(computeReadingMinutes('Vài từ ngắn')).toBe(1);
  });

  it('rounds to the nearest minute at 200 words per minute', () => {
    const words = new Array(500).fill('từ').join(' ');
    expect(computeReadingMinutes(words)).toBe(3); // 500 / 200 = 2.5 -> rounds up to 3
  });

  it('ignores extra whitespace when counting words', () => {
    const content = '  một   hai\n\nba   ';
    expect(computeReadingMinutes(content)).toBe(1);
  });
});
