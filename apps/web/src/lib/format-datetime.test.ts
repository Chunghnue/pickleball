import { describe, it, expect } from 'vitest';
import { formatHeaderClock } from './format-datetime';

describe('formatHeaderClock', () => {
  it('formats a Saturday date with a Vietnamese weekday and zero-padded time', () => {
    const date = new Date(2026, 7, 29, 14, 30, 5);
    expect(formatHeaderClock(date)).toBe('Thứ Bảy, 29/08/2026 · 14:30:05');
  });

  it('zero-pads single-digit day, month, hour, minute, and second', () => {
    const date = new Date(2026, 0, 5, 3, 4, 6);
    expect(formatHeaderClock(date)).toBe('Thứ Hai, 05/01/2026 · 03:04:06');
  });
});
