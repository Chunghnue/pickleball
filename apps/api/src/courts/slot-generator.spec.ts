import { generateSlots } from './slot-generator';

describe('generateSlots', () => {
  it('generates consecutive slots from open to close time', () => {
    const slots = generateSlots({
      openTime: '08:00',
      closeTime: '10:00',
      slotDurationMinutes: 60,
      pricePerHour: 100000,
    });

    expect(slots).toEqual([
      { start: '08:00', end: '09:00', price: 100000 },
      { start: '09:00', end: '10:00', price: 100000 },
    ]);
  });

  it('scales price to the slot duration', () => {
    const slots = generateSlots({
      openTime: '08:00',
      closeTime: '09:00',
      slotDurationMinutes: 30,
      pricePerHour: 100000,
    });

    expect(slots).toEqual([
      { start: '08:00', end: '08:30', price: 50000 },
      { start: '08:30', end: '09:00', price: 50000 },
    ]);
  });

  it('drops a trailing partial slot that does not fit evenly', () => {
    const slots = generateSlots({
      openTime: '08:00',
      closeTime: '09:50',
      slotDurationMinutes: 60,
      pricePerHour: 100000,
    });

    expect(slots).toEqual([{ start: '08:00', end: '09:00', price: 100000 }]);
  });

  it('handles times with a seconds component from the Postgres time column', () => {
    const slots = generateSlots({
      openTime: '08:00:00',
      closeTime: '09:00:00',
      slotDurationMinutes: 60,
      pricePerHour: 100000,
    });

    expect(slots).toEqual([{ start: '08:00', end: '09:00', price: 100000 }]);
  });

  it('returns no slots when the window is shorter than one slot', () => {
    const slots = generateSlots({
      openTime: '08:00',
      closeTime: '08:10',
      slotDurationMinutes: 60,
      pricePerHour: 100000,
    });

    expect(slots).toEqual([]);
  });
});
