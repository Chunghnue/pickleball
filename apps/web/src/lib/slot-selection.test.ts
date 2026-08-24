import { describe, it, expect } from 'vitest';
import { computeMaxConsecutiveDuration, type AvailabilitySlot } from './slot-selection';

function slot(isBooked: boolean): AvailabilitySlot {
  return { start: '08:00', end: '09:00', price: 100000, isBooked };
}

describe('computeMaxConsecutiveDuration', () => {
  it('returns the full remaining count when nothing after is booked', () => {
    const slots = [slot(false), slot(false), slot(false)];
    expect(computeMaxConsecutiveDuration(slots, 0)).toBe(3);
  });

  it('stops at the first booked slot after the selection', () => {
    const slots = [slot(false), slot(false), slot(true), slot(false)];
    expect(computeMaxConsecutiveDuration(slots, 0)).toBe(2);
  });

  it('returns 1 when the selected slot is the last in the array', () => {
    const slots = [slot(false), slot(false), slot(false)];
    expect(computeMaxConsecutiveDuration(slots, 2)).toBe(1);
  });

  it('returns 0 when the selected slot itself is booked', () => {
    const slots = [slot(true), slot(false)];
    expect(computeMaxConsecutiveDuration(slots, 0)).toBe(0);
  });
});
