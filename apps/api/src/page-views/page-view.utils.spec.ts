import { classifySource, detectIsMobile } from './page-view.utils';

describe('detectIsMobile', () => {
  it('detects an iPhone user agent as mobile', () => {
    expect(
      detectIsMobile('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'),
    ).toBe(true);
  });

  it('detects an Android user agent as mobile', () => {
    expect(detectIsMobile('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(true);
  });

  it('treats a desktop user agent as non-mobile', () => {
    expect(detectIsMobile('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
  });

  it('returns false when the user agent is missing', () => {
    expect(detectIsMobile(undefined)).toBe(false);
  });
});

describe('classifySource', () => {
  it('classifies a missing referrer as direct', () => {
    expect(classifySource(null)).toBe('direct');
    expect(classifySource(undefined)).toBe('direct');
  });

  it('classifies facebook and zalo referrers as social', () => {
    expect(classifySource('https://www.facebook.com/')).toBe('social');
    expect(classifySource('https://zalo.me/share')).toBe('social');
  });

  it('classifies google and bing referrers as search', () => {
    expect(classifySource('https://www.google.com/search?q=pickleball')).toBe('search');
    expect(classifySource('https://www.bing.com/search?q=pickleball')).toBe('search');
  });

  it('classifies an unrecognized referrer as referral', () => {
    expect(classifySource('https://some-blog.vn/review')).toBe('referral');
  });

  it('treats an unparseable referrer as direct rather than throwing', () => {
    expect(classifySource('not-a-url')).toBe('direct');
  });
});
