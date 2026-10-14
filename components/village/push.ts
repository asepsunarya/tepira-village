import { removePushSubscription } from "@/app/village/push-actions";
import { publicVapidKey } from "@/lib/vapid-key";
import { writePushWanted } from "./daily";

/**
 * Web push di browser: service worker (public/sw.js, hanya push + klik notifikasi), izin, dan
 * langganan. Semua aman dipanggil di browser mana pun: yang tidak didukung (Safari tab biasa di
 * iPhone, Firefox tanpa layanan push, dsb.) dijawab lewat pushEnv(), tidak pernah melempar ReferenceError.
 */

/**
 * Diisi saat build (NEXT_PUBLIC_*): mengganti kunci butuh deploy ulang, perangkat berlangganan ulang sendiri.
 * Dinormalkan sama dengan server (kutip/spasi dari dashboard dibuang, lib/vapid-key.ts): server yang bilang
 * "sudah diatur" berarti browser juga bisa berlangganan. Bukan base64url = "" → "belum diatur".
 */
export const VAPID_PUBLIC_KEY = publicVapidKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

export type PushEnv = "ok" | "ios-install" | "unsupported" | "not-configured";

function isIos() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushEnv(): PushEnv {
  if (typeof window === "undefined") return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "not-configured";
  if (window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window) {
    return "ok";
  }
  // iPhone/iPad: push hanya untuk web app yang dipasang di Layar Utama (iOS 16.4+).
  return isIos() && !isStandalone() ? "ios-install" : "unsupported";
}

/** Tab Safari biasa di iPhone tidak punya `Notification` sama sekali: jangan pernah akses tanpa ini. */
export const notificationPermission = (): NotificationPermission | "unsupported" =>
  typeof Notification === "undefined" ? "unsupported" : Notification.permission;

export const registerPushWorker = () =>
  navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });

export function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const padded = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameBytes(a: ArrayBuffer | null | undefined, b: Uint8Array) {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

/** Langganan yang ada sekarang (tanpa minta izin, tanpa membuat baru). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

/**
 * Langganan dengan kunci VAPID sekarang: dipakai ulang kalau ada, dibuat kalau belum, dibuat ulang
 * kalau kuncinya sudah diganti. Tidak memunculkan prompt kalau izin sudah diberikan.
 */
export async function ensureSubscription(): Promise<PushSubscription> {
  await registerPushWorker(); // `ready` tidak pernah selesai tanpa registrasi
  const reg = await navigator.serviceWorker.ready;
  const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  let sub = await reg.pushManager.getSubscription();
  // Browser yang tidak melaporkan kuncinya (options kosong) dianggap cocok: jangan berlangganan ulang tiap dibuka.
  const current = sub?.options?.applicationServerKey;
  if (sub && current && !sameBytes(current, key)) {
    await sub.unsubscribe().catch(() => false);
    sub = null;
  }
  return sub ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

export type EnableResult =
  | { ok: true; sub: PushSubscriptionJSON }
  | { ok: false; reason: "denied" | "dismissed" | "error"; message: string };

/**
 * Panggil LANGSUNG dari onClick: requestPermission harus await pertama (aturan gesture di iOS &
 * Firefox; await lain sebelumnya bisa membuat prompt tidak muncul).
 */
export async function enablePush(): Promise<EnableResult> {
  const perm = await Notification.requestPermission();
  if (perm === "denied") return { ok: false, reason: "denied", message: "Notifikasi untuk desa diblokir di browser ini." };
  if (perm !== "granted") return { ok: false, reason: "dismissed", message: "Izin notifikasi belum diberikan." };
  try {
    return { ok: true, sub: (await ensureSubscription()).toJSON() };
  } catch (e) {
    const abort = e instanceof DOMException && (e.name === "AbortError" || e.name === "NotAllowedError");
    return {
      ok: false,
      reason: "error",
      message: abort
        ? "Layanan push browser ini mati (mis. Brave: nyalakan 'Use Google services for push messaging' di pengaturan)."
        : "Gagal menyalakan pengingat di browser ini."
    };
  }
}

/** Matikan di perangkat ini: hapus di server dulu (masih login), lalu lepas langganan browser. */
export async function disablePushHere(owner: string) {
  writePushWanted(owner, false);
  const sub = await currentSubscription();
  if (!sub) return;
  await removePushSubscription(sub.endpoint);
  await sub.unsubscribe().catch(() => false);
}

/** Sebelum keluar akun: sama dengan disablePushHere, tapi maks 2 detik supaya keluar tidak tertahan. */
export async function disablePushForLogout(owner: string) {
  try {
    await Promise.race([disablePushHere(owner), new Promise((resolve) => setTimeout(resolve, 2000))]);
  } catch {
    // keluar akun tetap jalan
  }
}
