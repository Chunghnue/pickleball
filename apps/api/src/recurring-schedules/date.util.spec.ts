import { addDays } from './date.util';

describe('addDays', () => {
  it('adds days within the same month', () => {
    expect(addDays('2026-01-01', 5)).toBe('2026-01-06');
  });

  it('rolls over a month boundary', () => {
    expect(addDays('2026-01-30', 5)).toBe('2026-02-04');
  });

  it('rolls over a year boundary', () => {
    expect(addDays('2026-12-30', 5)).toBe('2027-01-04');
  });

  it('supports adding a single day', () => {
    expect(addDays('2026-08-24', 1)).toBe('2026-08-25');
  });
});
