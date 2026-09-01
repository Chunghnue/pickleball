import { buildCustomerCode, classifyTier } from './customer-classification';

describe('classifyTier', () => {
  it('is "new" at 0 and 1 bookings with low spend', () => {
    expect(classifyTier(0, 0)).toBe('new');
    expect(classifyTier(1, 4_999_999)).toBe('new');
  });

  it('is "regular" between 2 and 9 bookings with sub-VIP spend', () => {
    expect(classifyTier(2, 0)).toBe('regular');
    expect(classifyTier(9, 4_999_999)).toBe('regular');
  });

  it('is "vip" at the 10-booking boundary', () => {
    expect(classifyTier(10, 0)).toBe('vip');
  });

  it('is "vip" at the 5,000,000 spend boundary even with a single booking', () => {
    expect(classifyTier(1, 5_000_000)).toBe('vip');
  });
});

describe('buildCustomerCode', () => {
  it('prefixes KH- and uppercases the first 8 chars of the id', () => {
    expect(buildCustomerCode('550e8400-e29b-41d4-a716-446655440000')).toBe('KH-550E8400');
  });
});
