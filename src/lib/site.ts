// Single source of truth for the production origin, used for canonical
// URLs, Open Graph/Twitter tags, and sitemap generation. Update this the
// day the real domain goes live — scripts/prerender.mjs has a copy of the
// same value (it's a plain Node script and can't import this module), so
// keep the two in sync when this changes.
export const SITE_URL = "https://quickwaiterz.com";

/** Auth redirects and shareable links always use the canonical domain in production. */
export function getAppOrigin(): string {
  if (import.meta.env.DEV) return window.location.origin;
  return SITE_URL;
}
