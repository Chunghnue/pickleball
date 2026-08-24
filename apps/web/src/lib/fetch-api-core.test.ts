import { describe, it, expect, vi } from 'vitest';
import { fetchApiCore } from './fetch-api-core';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchApiCore', () => {
  it('returns the response directly when the status is not 401', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ ok: true }, 200));
    const onTokensRefreshed = vi.fn();

    const response = await fetchApiCore(
      {
        fetchFn,
        apiBaseUrl: 'http://api.test',
        getAccessToken: () => 'access-1',
        getRefreshToken: () => 'refresh-1',
        onTokensRefreshed,
      },
      '/users/me',
    );

    expect(response.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(onTokensRefreshed).not.toHaveBeenCalled();
  });

  it('refreshes and retries once on a 401, returning the retried response', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: 'access-2', refreshToken: 'refresh-2' }, 201),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    const onTokensRefreshed = vi.fn();

    const response = await fetchApiCore(
      {
        fetchFn,
        apiBaseUrl: 'http://api.test',
        getAccessToken: () => 'access-1',
        getRefreshToken: () => 'refresh-1',
        onTokensRefreshed,
      },
      '/users/me',
    );

    expect(response.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      'http://api.test/auth/refresh',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(onTokensRefreshed).toHaveBeenCalledWith({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    });
  });

  it('gives up and returns the original 401 when there is no refresh token', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: 'Unauthorized' }, 401));

    const response = await fetchApiCore(
      {
        fetchFn,
        apiBaseUrl: 'http://api.test',
        getAccessToken: () => 'access-1',
        getRefreshToken: () => undefined,
        onTokensRefreshed: vi.fn(),
      },
      '/users/me',
    );

    expect(response.status).toBe(401);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('gives up and returns the original 401 when the refresh call itself fails', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ message: 'Refresh token không hợp lệ' }, 401),
      );

    const response = await fetchApiCore(
      {
        fetchFn,
        apiBaseUrl: 'http://api.test',
        getAccessToken: () => 'access-1',
        getRefreshToken: () => 'refresh-1',
        onTokensRefreshed: vi.fn(),
      },
      '/users/me',
    );

    expect(response.status).toBe(401);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
