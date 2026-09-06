import { useEffect } from "react";

const VISITOR_ID_KEY = "pv_visitor_id";

function getOrCreateVisitorId(): string {
  const existing = window.localStorage.getItem(VISITOR_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  window.localStorage.setItem(VISITOR_ID_KEY, id);
  return id;
}

function alreadyTrackedThisSession(venueId: string, path: string): boolean {
  const key = `pv_seen:${venueId}:${path}`;
  if (window.sessionStorage.getItem(key)) return true;
  window.sessionStorage.setItem(key, "1");
  return false;
}

export function trackPageView(venueId: string, path: string): void {
  if (typeof window === "undefined") return;
  if (alreadyTrackedThisSession(venueId, path)) return;

  const body = JSON.stringify({
    venueId,
    path,
    visitorId: getOrCreateVisitorId(),
    referrer: document.referrer || undefined,
  });

  fetch("/api/page-views/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Best-effort analytics ping; a failed request must never affect the page.
  });
}

export function useTrackPageView(venueId: string | undefined): void {
  useEffect(() => {
    if (!venueId) return;
    trackPageView(venueId, window.location.pathname);
  }, [venueId]);
}
