const MOBILE_UA_PATTERN = /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i;

export function detectIsMobile(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  return MOBILE_UA_PATTERN.test(userAgent);
}

const SOCIAL_HOST_PATTERN =
  /facebook\.|fb\.com|instagram\.|zalo\.|tiktok\.|youtube\.|messenger\./i;
const SEARCH_HOST_PATTERN = /google\.|bing\.|yahoo\.|coccoc\.|duckduckgo\./i;

export function classifySource(referrer: string | undefined | null): string {
  if (!referrer) return 'direct';
  let host: string;
  try {
    host = new URL(referrer).hostname;
  } catch {
    return 'direct';
  }
  if (SOCIAL_HOST_PATTERN.test(host)) return 'social';
  if (SEARCH_HOST_PATTERN.test(host)) return 'search';
  return 'referral';
}
