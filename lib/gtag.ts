/** GA4 event helper — no-ops when gtag is not loaded (dev, ad blockers). */
export function trackEvent(
  action: string,
  params?: Record<string, string | number>
): void {
  if (typeof window === "undefined") return;
  const w = window as { gtag?: (...args: unknown[]) => void };
  w.gtag?.("event", action, params);
}
