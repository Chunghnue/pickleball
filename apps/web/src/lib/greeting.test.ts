import { describe, it, expect } from 'vitest';
import { getGreeting } from './greeting';

describe('getGreeting', () => {
  it('returns the morning greeting before 11:00', () => {
    expect(getGreeting(new Date(2026, 7, 30, 10, 59))).toBe('Chào buổi sáng!');
  });

  it('returns the midday greeting starting at 11:00', () => {
    expect(getGreeting(new Date(2026, 7, 30, 11, 0))).toBe('Chào buổi trưa!');
  });

  it('returns the midday greeting just before 13:00', () => {
    expect(getGreeting(new Date(2026, 7, 30, 12, 59))).toBe('Chào buổi trưa!');
  });

  it('returns the afternoon greeting starting at 13:00', () => {
    expect(getGreeting(new Date(2026, 7, 30, 13, 0))).toBe('Chào buổi chiều!');
  });

  it('returns the afternoon greeting just before 18:00', () => {
    expect(getGreeting(new Date(2026, 7, 30, 17, 59))).toBe('Chào buổi chiều!');
  });

  it('returns the evening greeting starting at 18:00', () => {
    expect(getGreeting(new Date(2026, 7, 30, 18, 0))).toBe('Chào buổi tối!');
  });

  it('returns the evening greeting late at night', () => {
    expect(getGreeting(new Date(2026, 7, 30, 23, 30))).toBe('Chào buổi tối!');
  });
});
