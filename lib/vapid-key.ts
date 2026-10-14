/**
 * Normalisasi env VAPID yang dipakai BERSAMA server (lib/push-send.ts) dan browser
 * (components/village/push.ts), supaya keduanya selalu sepakat: kunci yang dianggap sah oleh server pasti
 * bisa dipakai browser untuk berlangganan, dan sebaliknya. Modul murni, aman di-bundle ke browser.
 */

/** Nilai seperti yang diisi di dashboard Vercel / .env: spasi & tanda kutip pembungkus ("BEl…") dibuang. */
export const envValue = (v: string | undefined) => (v ?? "").trim().replace(/^"(.*)"$/, "$1").trim();

/** Kunci VAPID = base64url tanpa padding. */
export const B64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Kunci publik VAPID untuk browser (NEXT_PUBLIC_VAPID_PUBLIC_KEY, di-build ke bundle). Dinormalkan sama
 * dengan server; yang bukan base64url = "" (pengingat "belum diatur", bukan gagal diam-diam di atob).
 */
export function publicVapidKey(raw: string | undefined) {
  const key = envValue(raw);
  return B64URL.test(key) ? key : "";
}
