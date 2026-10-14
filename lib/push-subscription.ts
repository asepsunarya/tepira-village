/**
 * Validasi langganan push dari browser (murni; dites di push-subscription.test.ts). Endpoint adalah
 * URL yang nanti di-POST oleh cron, jadi hanya layanan push yang dikenal yang diterima: tanpa ini
 * siapa pun yang login bisa membuat server mengirim permintaan ke alamat sembarang (SSRF).
 */

/** Host persis: FCM (Chrome, Edge Android, Samsung, Opera), Mozilla, Apple (Safari/iOS). */
const PUSH_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);
/** Subdomain: WNS (Edge desktop, mis. wns2-par02p.notify.windows.com) dan layanan push Apple lain. */
const PUSH_HOST_SUFFIXES = [".notify.windows.com", ".push.apple.com"];

export const MAX_ENDPOINT_LENGTH = 2000;
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export interface ParsedSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime: Date | null;
}

export function isPushServiceUrl(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.has(host) || PUSH_HOST_SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length);
}

const keyOk = (v: unknown, min: number, max: number): v is string =>
  typeof v === "string" && v.length >= min && v.length <= max && B64URL.test(v);

/**
 * `PushSubscription.toJSON()` dari browser → data yang disimpan, atau null kalau tidak sah.
 * p256dh = titik P-256 tak terkompresi (65 byte ≈ 87 karakter), auth = 16 byte (≈ 22 karakter).
 */
export function parsePushSubscription(input: unknown): ParsedSubscription | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as { endpoint?: unknown; keys?: unknown; expirationTime?: unknown };
  const endpoint = raw.endpoint;
  if (typeof endpoint !== "string" || !endpoint || endpoint.length > MAX_ENDPOINT_LENGTH) return null;
  if (!isPushServiceUrl(endpoint)) return null;
  const keys = (raw.keys && typeof raw.keys === "object" ? raw.keys : {}) as { p256dh?: unknown; auth?: unknown };
  if (!keyOk(keys.p256dh, 80, 100) || !keyOk(keys.auth, 16, 32)) return null;
  const exp = raw.expirationTime;
  const expirationTime =
    typeof exp === "number" && Number.isFinite(exp) && exp > 0 && exp < 8.64e15 ? new Date(exp) : null;
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth, expirationTime };
}

/** Disimpan apa adanya (dipendekkan) untuk daftar perangkat. */
export const cleanUserAgent = (ua: string | null | undefined) => (ua ? ua.trim().slice(0, 300) || null : null);

/** "Chrome · Android", "Safari · iPhone", … dari user-agent (≤ 40 karakter). */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /CrOS/.test(ua)
              ? "ChromeOS"
              : /Linux/.test(ua)
                ? "Linux"
                : "";
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? "Edge"
    : /SamsungBrowser\//.test(ua)
      ? "Samsung Internet"
      : /OPR\/|Opera/.test(ua)
        ? "Opera"
        : /Firefox\/|FxiOS\//.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "";
  const label = [browser, os].filter(Boolean).join(" · ");
  return (label || "Perangkat lain").slice(0, 40);
}
