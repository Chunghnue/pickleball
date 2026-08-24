import { generateBookingSlotStarts } from './booking-slot-generator';

const GRID = { openTime: '08:00', closeTime: '20:00', slotDurationMinutes: 60 };

describe('generateBookingSlotStarts', () => {
  it('returns one slot start for a single-slot booking', () => {
    expect(generateBookingSlotStarts('08:00', '09:00', GRID)).toEqual(['08:00']);
  });

  it('returns multiple consecutive slot starts for a multi-slot booking', () => {
    expect(generateBookingSlotStarts('08:00', '10:00', GRID)).toEqual([
      '08:00',
      '09:00',
    ]);
  });

  it('returns null when start is not aligned to the grid', () => {
    expect(generateBookingSlotStarts('08:30', '09:30', GRID)).toBeNull();
  });

  it('returns null when the range duration is not a multiple of slot duration', () => {
    expect(generateBookingSlotStarts('08:00', '08:30', GRID)).toBeNull();
  });

  it('returns null when start is before openTime', () => {
    expect(generateBookingSlotStarts('07:00', '08:00', GRID)).toBeNull();
  });

  it('returns null when end is after closeTime', () => {
    expect(generateBookingSlotStarts('19:00', '21:00', GRID)).toBeNull();
  });

  it('returns null when start is not before end', () => {
    expect(generateBookingSlotStarts('09:00', '09:00', GRID)).toBeNull();
    expect(generateBookingSlotStarts('10:00', '09:00', GRID)).toBeNull();
  });
});
