import { describe, it, expect } from 'vitest';
import { getSubmitErrorMessage } from './error-message';

describe('getSubmitErrorMessage', () => {
  it('returns the rate-limit message for a 429, ignoring the response body', () => {
    const response = new Response(null, { status: 429 });
    expect(getSubmitErrorMessage(response, { message: 'ThrottlerException' })).toBe(
      'Bạn đã thử quá nhiều lần, vui lòng thử lại sau.',
    );
  });

  it('returns the API message for any other error status', () => {
    const response = new Response(null, { status: 409 });
    expect(getSubmitErrorMessage(response, { message: 'Email đã được sử dụng' })).toBe(
      'Email đã được sử dụng',
    );
  });

  it('falls back to a generic message when the body has none', () => {
    const response = new Response(null, { status: 500 });
    expect(getSubmitErrorMessage(response, null)).toBe(
      'Có lỗi xảy ra, vui lòng thử lại.',
    );
  });
});
