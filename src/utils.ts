/**
 * Shared UI helpers: HTML escaping (XSS) and PFV formatting.
 */

/** Allow only safe URLs for img src (https: or relative /). Prevents javascript: / data: XSS. */
export function safeAvatarUrl(url: string | null | undefined): string | null {
  const u = typeof url === "string" ? url.trim() : "";
  if (!u) return null;
  if (u.startsWith("https://") || u.startsWith("/")) return u;
  return null;
}

/** Escape for HTML text and attributes (full set: & < > " '). */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Format PFV: integer only (floor), thousand separator comma. */
export function formatPfv(n: number): string {
  return Math.floor(n).toLocaleString("en-US");
}

/** Same as formatPfv but space as thousand separator (for tables). */
export function formatPfvSpace(n: number): string {
  return formatPfv(n).replace(/,/g, " ");
}
