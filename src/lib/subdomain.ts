// Multi-tenant subdomain utilities for KnoqGen
// Each org gets:  [slug].knoqgen.com
// Landing pages:  [slug].knoqgen.com/v/[page-slug]
// Rep dashboard:  [slug].knoqgen.com/rep

export const ROOT_DOMAIN = "knoqgen.com";

/**
 * Extract the org slug from a Host header value.
 *   "johnnymowing.knoqgen.com" → "johnnymowing"
 *   "knoqgen.com"              → null
 *   "www.knoqgen.com"          → null
 *   "localhost:8787"                  → null
 */
export function getSubdomain(host: string): string | null {
  const h = (host || "").split(":")[0].toLowerCase();
  if (!h.endsWith(`.${ROOT_DOMAIN}`)) return null;
  const sub = h.slice(0, h.length - ROOT_DOMAIN.length - 1);
  // Reject www, empty, or slugs with invalid chars
  if (!sub || sub === "www" || !/^[a-z0-9][a-z0-9-]*$/.test(sub)) return null;
  return sub;
}

/**
 * Returns true if the host is the bare root domain (not a subdomain).
 */
export function isRootDomain(host: string): boolean {
  const h = (host || "").split(":")[0].toLowerCase();
  return h === ROOT_DOMAIN || h === `www.${ROOT_DOMAIN}`;
}

/**
 * Build the base URL for an org's subdomain.
 *   ("johnnymowing", "https://knoqgen.com") → "https://johnnymowing.knoqgen.com"
 */
export function orgBaseUrl(slug: string, siteUrl: string): string {
  try {
    const u = new URL(siteUrl);
    return `${u.protocol}//${slug}.${u.hostname}`;
  } catch {
    return `https://${slug}.${ROOT_DOMAIN}`;
  }
}

/**
 * Full URL for a specific landing page on the org's subdomain.
 *   ("johnnymowing", "oak-st-abc", "https://knoqgen.com")
 *     → "https://johnnymowing.knoqgen.com/v/oak-st-abc"
 */
export function pageUrl(orgSlug: string, pageSlug: string, siteUrl: string): string {
  return `${orgBaseUrl(orgSlug, siteUrl)}/v/${pageSlug}`;
}

/**
 * Cookie domain for cross-subdomain sharing.
 * Returns ".knoqgen.com" so a session set on the root domain
 * is readable on all subdomains and vice versa.
 * Returns undefined for localhost / workers.dev (cross-subdomain not needed).
 */
export function cookieDomain(siteUrl: string): string | undefined {
  try {
    const h = new URL(siteUrl).hostname;
    if (h === "localhost" || h.endsWith(".workers.dev")) return undefined;
    return `.${h}`;
  } catch {
    return undefined;
  }
}
