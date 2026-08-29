import { describe, it, expect } from 'vitest';
import { formatHeaderDate, formatHeaderTime } from './format-datetime';

describe('formatHeaderDate', () => {
  it('formats a Saturday date with a Vietnamese weekday', () => {
    const date = new Date(2026, 7, 29, 14, 30, 5);
    expect(formatHeaderDate(date)).toBe('Thứ Bảy, 29/08/2026');
  });

  it('zero-pads single-digit day and month', () => {
    const date = new Date(2026, 0, 5, 3, 4, 6);
    expect(formatHeaderDate(date)).toBe('Thứ Hai, 05/01/2026');
  });
});

describe('formatHeaderTime', () => {
  it('zero-pads single-digit hour, minute, and second', () => {
    const date = new Date(2026, 0, 5, 3, 4, 6);
    expect(formatHeaderTime(date)).toBe('03:04:06');
  });

  it('formats a time with double-digit components unchanged', () => {
    const date = new Date(2026, 7, 29, 14, 30, 5);
    expect(formatHeaderTime(date)).toBe('14:30:05');
  });
});
