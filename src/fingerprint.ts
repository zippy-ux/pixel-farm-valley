/**
 * Browser fingerprint for rate limiting (e.g. max accounts per device).
 * Sends a stable hash to the server. No external dependency so build always works.
 */
let cached: Promise<string> | null = null;

function getFingerprintData(): string {
  const nav = typeof navigator !== "undefined" ? navigator : { userAgent: "", language: "", hardwareConcurrency: 0 };
  const scr = typeof screen !== "undefined" ? screen : { width: 0, height: 0 };
  return [
    nav.userAgent,
    nav.language,
    String(scr.width),
    String(scr.height),
    String(new Date().getTimezoneOffset()),
    nav.hardwareConcurrency ? String(nav.hardwareConcurrency) : "",
  ].join("|");
}

async function hashString(data: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = new TextEncoder().encode(data);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  let h = 0;
  for (let i = 0; i < data.length; i++) h = ((h << 5) - h + data.charCodeAt(i)) | 0;
  return "x" + (h >>> 0).toString(16);
}

export async function getFingerprint(): Promise<string> {
  if (cached) return cached;
  cached = hashString(getFingerprintData());
  return cached;
}
