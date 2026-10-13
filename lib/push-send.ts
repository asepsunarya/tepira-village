import { createECDH } from "node:crypto";
import webpush from "web-push";
import type { PushPayload, PushTarget, SendOptions, SendOutcome, Sender } from "@/lib/reminders";

/**
 * Pengirim web push (HANYA server: web-push butuh crypto & https Node). Kunci VAPID dibaca dari env
 * dan diberikan per kiriman (vapidDetails), bukan setVapidDetails di level modul: tanpa env, `next
 * build` tetap jalan dan desa tetap hidup, hanya pengingatnya yang "belum diatur".
 */

export interface VapidConfig {
  subject: string;
  publicKey: string;
  privateKey: string;
}

export type VapidCheck =
  | { ok: true; config: VapidConfig }
  | { ok: false; problem: "missing" | "subject" | "keys" | "mismatch" };

const B64URL = /^[A-Za-z0-9_-]+$/;
const envValue = (v: string | undefined) => (v ?? "").trim().replace(/^"(.*)"$/, "$1").trim();

/** mailto: atau https:, bukan localhost (Apple menolak dengan 403 BadJwtToken). */
export function validSubject(subject: string) {
  if (/^mailto:[^@\s]+@[^@\s]+$/.test(subject)) return true;
  try {
    const url = new URL(subject);
    return url.protocol === "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

/** Kunci publik harus pasangan kunci privat: kalau tertukar, semua kiriman ditolak (dan langganan terhapus). */
export function vapidKeysMatch(publicKey: string, privateKey: string) {
  if (!B64URL.test(publicKey) || !B64URL.test(privateKey)) return false;
  try {
    const priv = Buffer.from(privateKey, "base64url");
    const pub = Buffer.from(publicKey, "base64url");
    if (priv.length !== 32 || pub.length !== 65 || pub[0] !== 4) return false;
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(priv);
    return ecdh.getPublicKey().equals(pub);
  } catch {
    return false;
  }
}

export function checkVapid(env: Record<string, string | undefined> = process.env): VapidCheck {
  const publicKey = envValue(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const privateKey = envValue(env.VAPID_PRIVATE_KEY);
  const subject = envValue(env.VAPID_SUBJECT);
  if (!publicKey || !privateKey || !subject) return { ok: false, problem: "missing" };
  if (!validSubject(subject)) return { ok: false, problem: "subject" };
  if (!B64URL.test(publicKey) || !B64URL.test(privateKey)) return { ok: false, problem: "keys" };
  if (!vapidKeysMatch(publicKey, privateKey)) return { ok: false, problem: "mismatch" };
  return { ok: true, config: { subject, publicKey, privateKey } };
}

let warnedProblem: string | null = null;

/** Konfigurasi VAPID yang sah, atau null (sekali peringatan di log per proses, tanpa nilai kunci). */
export function vapidConfig(env: Record<string, string | undefined> = process.env): VapidConfig | null {
  const check = checkVapid(env);
  if (check.ok) return check.config;
  if (check.problem !== "missing" && warnedProblem !== check.problem) {
    warnedProblem = check.problem;
    console.warn(`[push] VAPID tidak sah (${check.problem}); pengingat tidak dikirim.`);
  }
  return null;
}

type SendNotification = typeof webpush.sendNotification;

/** Kirim lewat web-push. `send` bisa diganti di tes (web-push palsu). */
export function webPushSender(v: VapidConfig, send: SendNotification = webpush.sendNotification): Sender {
  return async (target: PushTarget, payload: PushPayload, opts: SendOptions): Promise<SendOutcome> => {
    try {
      const res = await send(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        {
          TTL: opts.ttl,
          topic: opts.topic,
          urgency: opts.urgency ?? "normal",
          timeout: 10_000,
          vapidDetails: { subject: v.subject, publicKey: v.publicKey, privateKey: v.privateKey }
        }
      );
      return { ok: true, statusCode: res?.statusCode };
    } catch (error) {
      const status = (error as { statusCode?: unknown } | null)?.statusCode;
      return { ok: false, statusCode: typeof status === "number" ? status : undefined };
    }
  };
}

/** Host saja: endpoint lengkap = izin mengirim push, jangan pernah masuk log. */
export function endpointHost(endpoint: string) {
  try {
    return new URL(endpoint).host;
  } catch {
    return "?";
  }
}

/** PUSH_SEND_MODE=log (dev/tes): tidak mengirim apa pun, hanya mencatat host + tag + judul. */
export const logSender: Sender = async (target, payload) => {
  console.info("[push:log]", endpointHost(target.endpoint), payload.tag, payload.title);
  return { ok: true, statusCode: 201 };
};

/** Pengirim yang dipakai server: log (PUSH_SEND_MODE=log), web-push (VAPID sah), atau null (belum diatur). */
export function serverSender(env: Record<string, string | undefined> = process.env): Sender | null {
  if (envValue(env.PUSH_SEND_MODE) === "log") return logSender;
  const v = vapidConfig(env);
  return v ? webPushSender(v) : null;
}
