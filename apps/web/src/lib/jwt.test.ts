import { describe, it, expect } from 'vitest';
import { decodeJwtPayload } from './jwt';

function base64UrlEncode(json: object): string {
  const base64 = Buffer.from(JSON.stringify(json)).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('decodeJwtPayload', () => {
  it('decodes a valid JWT payload', () => {
    const payload = { sub: 'user-1', role: 'admin', iat: 1, exp: 2 };
    const token = `header.${base64UrlEncode(payload)}.signature`;

    expect(decodeJwtPayload(token)).toEqual(payload);
  });

  it('returns null for a token that is not three dot-separated parts', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
  });

  it('returns null when the payload segment is not valid base64/JSON', () => {
    expect(decodeJwtPayload('header.###.signature')).toBeNull();
  });
});
