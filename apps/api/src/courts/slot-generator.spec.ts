import { generateSlotTimes } from './slot-generator';

describe('generateSlotTimes', () => {
  it('generates consecutive slots from open to close time', () => {
    const slots = generateSlotTimes({
      openTime: '08:00',
      closeTime: '10:00',
      slotDurationMinutes: 60,
    });

    expect(slots).toEqual([
      { start: '08:00', end: '09:00' },
      { start: '09:00', end: '10:00' },
    ]);
  });

  it('supports slot durations shorter than an hour', () => {
    const slots = generateSlotTimes({
      openTime: '08:00',
      closeTime: '09:00',
      slotDurationMinutes: 30,
    });

    expect(slots).toEqual([
      { start: '08:00', end: '08:30' },
      { start: '08:30', end: '09:00' },
    ]);
  });

  it('drops a trailing partial slot that does not fit evenly', () => {
    const slots = generateSlotTimes({
      openTime: '08:00',
      closeTime: '09:50',
      slotDurationMinutes: 60,
    });

    expect(slots).toEqual([{ start: '08:00', end: '09:00' }]);
  });

  it('handles times with a seconds component from the Postgres time column', () => {
    const slots = generateSlotTimes({
      openTime: '08:00:00',
      closeTime: '09:00:00',
      slotDurationMinutes: 60,
    });

    expect(slots).toEqual([{ start: '08:00', end: '09:00' }]);
  });

  it('returns no slots when the window is shorter than one slot', () => {
    const slots = generateSlotTimes({
      openTime: '08:00',
      closeTime: '08:10',
      slotDurationMinutes: 60,
    });

    expect(slots).toEqual([]);
  });
});
