import { API_BASE_URL } from './api-config';
import { getAccessToken, getRefreshToken, setAuthCookies } from './auth-cookies';
import { fetchApiCore } from './fetch-api-core';

export function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  return fetchApiCore(
    {
      fetchFn: fetch,
      apiBaseUrl: API_BASE_URL,
      getAccessToken,
      getRefreshToken,
      onTokensRefreshed: setAuthCookies,
    },
    path,
    init,
  );
}
