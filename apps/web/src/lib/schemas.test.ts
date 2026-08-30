import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  createVenueSchema,
  updateVenueSchema,
  addVenueImageSchema,
  createCourtSchema,
  updateCourtSchema,
} from './schemas';

describe('registerSchema', () => {
  it('accepts a valid payload', () => {
    const result = registerSchema.safeParse({
      email: 'a@test.com',
      password: 'password123',
      fullName: 'A B',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = registerSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
      fullName: 'A B',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = registerSchema.safeParse({
      email: 'a@test.com',
      password: '123',
      fullName: 'A B',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty full name', () => {
    const result = registerSchema.safeParse({
      email: 'a@test.com',
      password: 'password123',
      fullName: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts a valid payload', () => {
    expect(
      loginSchema.safeParse({ email: 'a@test.com', password: 'anything' }).success,
    ).toBe(true);
  });

  it('rejects an empty password', () => {
    expect(
      loginSchema.safeParse({ email: 'a@test.com', password: '' }).success,
    ).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('accepts a valid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@test.com' }).success).toBe(
      true,
    );
  });

  it('rejects an invalid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts a valid payload', () => {
    expect(
      resetPasswordSchema.safeParse({ token: 'abc', newPassword: 'password123' })
        .success,
    ).toBe(true);
  });

  it('rejects a short new password', () => {
    expect(
      resetPasswordSchema.safeParse({ token: 'abc', newPassword: '123' }).success,
    ).toBe(false);
  });
});

describe('updateProfileSchema', () => {
  it('accepts an empty object (no fields required)', () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a valid avatarUrl', () => {
    expect(
      updateProfileSchema.safeParse({ avatarUrl: 'https://example.com/a.png' })
        .success,
    ).toBe(true);
  });

  it('rejects an invalid avatarUrl', () => {
    expect(updateProfileSchema.safeParse({ avatarUrl: 'not-a-url' }).success).toBe(
      false,
    );
  });

  it('accepts an empty string avatarUrl (an untouched optional field)', () => {
    expect(updateProfileSchema.safeParse({ avatarUrl: '' }).success).toBe(true);
  });
});

describe('createVenueSchema', () => {
  it('accepts a valid payload', () => {
    expect(
      createVenueSchema.safeParse({
        name: 'ABC Pickleball',
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
      }).success,
    ).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(
      createVenueSchema.safeParse({ name: '', address: 'X', city: 'Y' }).success,
    ).toBe(false);
  });

  it('accepts an optional description', () => {
    expect(
      createVenueSchema.safeParse({
        name: 'A',
        address: 'B',
        city: 'C',
        description: 'Mô tả',
      }).success,
    ).toBe(true);
  });
});

describe('updateVenueSchema', () => {
  it('accepts an empty object (no fields required)', () => {
    expect(updateVenueSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an empty name when provided', () => {
    expect(updateVenueSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('addVenueImageSchema', () => {
  it('accepts a valid URL', () => {
    expect(
      addVenueImageSchema.safeParse({ url: 'https://example.com/a.jpg' }).success,
    ).toBe(true);
  });

  it('rejects an invalid URL', () => {
    expect(addVenueImageSchema.safeParse({ url: 'not-a-url' }).success).toBe(
      false,
    );
  });
});

describe('createCourtSchema', () => {
  const valid = {
    name: 'Sân 1',
    pricePerHour: 100000,
    openTime: '08:00',
    closeTime: '20:00',
    slotDurationMinutes: 60,
  };

  it('accepts a valid payload', () => {
    expect(createCourtSchema.safeParse(valid).success).toBe(true);
  });

  it('coerces string number inputs from form fields', () => {
    const result = createCourtSchema.safeParse({
      ...valid,
      pricePerHour: '100000',
      slotDurationMinutes: '60',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pricePerHour).toBe(100000);
      expect(result.data.slotDurationMinutes).toBe(60);
    }
  });

  it('rejects a price of 0', () => {
    expect(
      createCourtSchema.safeParse({ ...valid, pricePerHour: 0 }).success,
    ).toBe(false);
  });

  it('rejects a malformed openTime', () => {
    expect(
      createCourtSchema.safeParse({ ...valid, openTime: '8:00' }).success,
    ).toBe(false);
  });

  it('rejects a slotDurationMinutes below 15', () => {
    expect(
      createCourtSchema.safeParse({ ...valid, slotDurationMinutes: 10 }).success,
    ).toBe(false);
  });

  it('rejects a slotDurationMinutes above 240', () => {
    expect(
      createCourtSchema.safeParse({ ...valid, slotDurationMinutes: 300 }).success,
    ).toBe(false);
  });

  it('accepts optional description/capacity/displayOrder', () => {
    const result = createCourtSchema.safeParse({
      ...valid,
      description: 'Sân ngoài trời',
      capacity: '8',
      displayOrder: '2',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.capacity).toBe(8);
      expect(result.data.displayOrder).toBe(2);
    }
  });

  it('rejects a capacity of 0', () => {
    expect(
      createCourtSchema.safeParse({ ...valid, capacity: 0 }).success,
    ).toBe(false);
  });
});

describe('updateCourtSchema', () => {
  it('accepts an empty object (no fields required)', () => {
    expect(updateCourtSchema.safeParse({}).success).toBe(true);
  });

  it('accepts status alone', () => {
    expect(
      updateCourtSchema.safeParse({ status: 'maintenance' }).success,
    ).toBe(true);
  });

  it('rejects a status outside the enum', () => {
    expect(
      updateCourtSchema.safeParse({ status: 'archived' }).success,
    ).toBe(false);
  });

  it('rejects a displayOrder that is not an integer', () => {
    expect(
      updateCourtSchema.safeParse({ displayOrder: 1.5 }).success,
    ).toBe(false);
  });

  it('rejects an out-of-range slotDurationMinutes when provided', () => {
    expect(
      updateCourtSchema.safeParse({ slotDurationMinutes: 500 }).success,
    ).toBe(false);
  });
});
