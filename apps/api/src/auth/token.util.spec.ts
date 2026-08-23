import { generateToken, hashToken } from './token.util';

describe('token.util', () => {
  it('generates a raw token whose hash matches hashToken(raw)', () => {
    const { raw, hash } = generateToken();

    expect(raw).toHaveLength(64); // 32 bytes hex-encoded
    expect(hash).toBe(hashToken(raw));
  });

  it('generates different tokens on each call', () => {
    const first = generateToken();
    const second = generateToken();

    expect(first.raw).not.toBe(second.raw);
  });
});
