export interface FetchApiCoreDeps {
  fetchFn: typeof fetch;
  apiBaseUrl: string;
  getAccessToken(): string | undefined | Promise<string | undefined>;
  getRefreshToken(): string | undefined | Promise<string | undefined>;
  onTokensRefreshed(tokens: {
    accessToken: string;
    refreshToken: string;
  }): void | Promise<void>;
}

export async function fetchApiCore(
  deps: FetchApiCoreDeps,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const attempt = (token: string | undefined) =>
    deps.fetchFn(`${deps.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  const firstResponse = await attempt(await deps.getAccessToken());
  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  const refreshToken = await deps.getRefreshToken();
  if (!refreshToken) {
    return firstResponse;
  }

  const refreshResponse = await deps.fetchFn(`${deps.apiBaseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!refreshResponse.ok) {
    return firstResponse;
  }

  const tokens = (await refreshResponse.json()) as {
    accessToken: string;
    refreshToken: string;
  };
  await deps.onTokensRefreshed(tokens);

  return attempt(tokens.accessToken);
}
