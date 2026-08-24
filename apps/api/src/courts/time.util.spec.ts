import { TIME_PATTERN, timeToMinutes } from './time.util';

describe('TIME_PATTERN', () => {
  it('matches valid HH:mm times', () => {
    expect(TIME_PATTERN.test('00:00')).toBe(true);
    expect(TIME_PATTERN.test('23:59')).toBe(true);
    expect(TIME_PATTERN.test('09:05')).toBe(true);
  });

  it('rejects invalid times', () => {
    expect(TIME_PATTERN.test('24:00')).toBe(false);
    expect(TIME_PATTERN.test('9:05')).toBe(false);
    expect(TIME_PATTERN.test('09:60')).toBe(false);
    expect(TIME_PATTERN.test('not-a-time')).toBe(false);
  });
});

describe('timeToMinutes', () => {
  it('converts HH:mm to minutes since midnight', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('01:30')).toBe(90);
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  it('ignores a trailing seconds component from Postgres time columns', () => {
    expect(timeToMinutes('08:00:00')).toBe(480);
  });
});
