import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  addVenueImageSchema,
  createCourtSchema,
  updateCourtSchema,
  changePasswordSchema,
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
  it('accepts a valid payload with an email identifier', () => {
    expect(
      loginSchema.safeParse({ identifier: 'a@test.com', password: 'anything' })
        .success,
    ).toBe(true);
  });

  it('accepts a valid payload with a phone identifier', () => {
    expect(
      loginSchema.safeParse({ identifier: '0911000001', password: 'anything' })
        .success,
    ).toBe(true);
  });

  it('rejects an empty identifier', () => {
    expect(
      loginSchema.safeParse({ identifier: '', password: 'anything' }).success,
    ).toBe(false);
  });

  it('rejects an empty password', () => {
    expect(
      loginSchema.safeParse({ identifier: 'a@test.com', password: '' }).success,
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

  it('keeps the address field in the parsed output', () => {
    const result = updateProfileSchema.parse({ address: '123 Lê Lợi, Q1' });
    expect(result.address).toBe('123 Lê Lợi, Q1');
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

describe('changePasswordSchema', () => {
  it('accepts a valid payload', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'oldpassword1',
        newPassword: 'newpassword1',
        confirmPassword: 'newpassword1',
      }).success,
    ).toBe(true);
  });

  it('rejects a newPassword shorter than 8 characters', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'oldpassword1',
        newPassword: '123',
        confirmPassword: '123',
      }).success,
    ).toBe(false);
  });

  it('rejects when confirmPassword does not match newPassword', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'oldpassword1',
      newPassword: 'newpassword1',
      confirmPassword: 'different1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['confirmPassword']);
    }
  });

  it('rejects an empty currentPassword', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: '',
        newPassword: 'newpassword1',
        confirmPassword: 'newpassword1',
      }).success,
    ).toBe(false);
  });
});
