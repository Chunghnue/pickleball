import { buildBookingCode } from './booking-code.util';

describe('buildBookingCode', () => {
  it('formats the first 8 characters of the id, uppercased, with a DL- prefix', () => {
    expect(buildBookingCode('3f9a2b10-cccc-dddd-eeee-ffffffffffff')).toBe('DL-3F9A2B10');
  });
});
