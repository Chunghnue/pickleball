import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
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
