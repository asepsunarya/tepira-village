"use server";

import { headers } from "next/headers";
import { requireActionUserId } from "@/lib/auth";
import { MISSING_TABLE_MESSAGE } from "@/lib/db-missing";
import { serverSender } from "@/lib/push-send";
import {
  NO_PUSH_STATUS,
  forgetDevice,
  loadReminderStatus,
  removeSubscription,
  saveSubscription,
  sendTestTo,
  setReminderPrefs
} from "@/lib/push-server";
import { parsePushSubscription } from "@/lib/push-subscription";
import type { ReminderStatus } from "@/lib/reminders";

/**
 * Server action pengingat web push (🔔 di panel Perkembangan desa). Tidak membangun snapshot: hanya
 * status pengingat. Pesan error tanpa detail teknis (tampil apa adanya di desa).
 */

export type PushActionResult =
  | { ok: true; status: ReminderStatus; message?: string }
  | { ok: false; message: string; code?: "missing" | "config" | "invalid" | "auth" | "error" };

const NOT_CONFIGURED = "Pengingat belum diatur di server ini (kunci VAPID belum diisi).";

const cleanEndpoint = (v: unknown) => (typeof v === "string" && v.length <= 2000 ? v : null);

async function statusFor(userId: string, endpoint: string | null) {
  return loadReminderStatus(userId, endpoint, serverSender() !== null);
}

function fail(error: unknown): PushActionResult {
  const message = error instanceof Error ? error.message : "Terjadi kesalahan.";
  if (message === MISSING_TABLE_MESSAGE) return { ok: false, message, code: "missing" };
  if (message.startsWith("Sesi habis")) return { ok: false, message, code: "auth" };
  console.error("[push action]", error);
  return { ok: false, message: "Gagal menyimpan pengingat. Coba lagi sebentar lagi.", code: "error" };
}

/** Status pengingat akun ini; `endpoint` = langganan browser ini (null kalau belum ada). */
export async function getReminderStatus(endpoint: unknown): Promise<ReminderStatus> {
  try {
    const userId = await requireActionUserId();
    return await statusFor(userId, cleanEndpoint(endpoint));
  } catch (error) {
    console.error("[push status]", error);
    return NO_PUSH_STATUS;
  }
}

/** Simpan langganan browser ini (Nyalakan, atau perbaikan otomatis saat desa dibuka). */
export async function savePushSubscription(input: unknown): Promise<PushActionResult> {
  try {
    const userId = await requireActionUserId();
    if (!serverSender()) return { ok: false, message: NOT_CONFIGURED, code: "config" };
    const sub = parsePushSubscription(input);
    if (!sub) return { ok: false, message: "Langganan notifikasi dari browser ini tidak dikenali.", code: "invalid" };
    await saveSubscription(userId, sub, (await headers()).get("user-agent"));
    return { ok: true, status: await statusFor(userId, sub.endpoint) };
  } catch (error) {
    return fail(error);
  }
}

/** Matikan di perangkat ini / keluar akun. Tidak pernah melempar (keluar akun tidak boleh tertahan). */
export async function removePushSubscription(endpoint: unknown): Promise<{ ok: boolean }> {
  try {
    const userId = await requireActionUserId();
    const ep = cleanEndpoint(endpoint);
    if (ep) await removeSubscription(userId, ep);
    return { ok: true };
  } catch (error) {
    console.error("[push remove]", error);
    return { ok: false };
  }
}

/** Hapus perangkat lain milik akun ini dari daftar penerima. */
export async function forgetPushDevice(id: unknown, endpoint: unknown): Promise<PushActionResult> {
  try {
    const userId = await requireActionUserId();
    const n = Math.round(Number(id));
    if (Number.isFinite(n) && n > 0) await forgetDevice(userId, n);
    return { ok: true, status: await statusFor(userId, cleanEndpoint(endpoint)) };
  } catch (error) {
    return fail(error);
  }
}

/** Nyala/matikan jenis pengingat untuk akun ini (semua perangkat). */
export async function updateReminderPrefs(prefs: unknown, endpoint: unknown): Promise<PushActionResult> {
  try {
    const userId = await requireActionUserId();
    const p = (prefs && typeof prefs === "object" ? prefs : {}) as { lampReminder?: unknown; billReminder?: unknown };
    await setReminderPrefs(userId, {
      ...(typeof p.lampReminder === "boolean" ? { lampReminder: p.lampReminder } : {}),
      ...(typeof p.billReminder === "boolean" ? { billReminder: p.billReminder } : {})
    });
    return { ok: true, status: await statusFor(userId, cleanEndpoint(endpoint)) };
  } catch (error) {
    return fail(error);
  }
}

/** Satu notifikasi tes ke perangkat ini saja. */
export async function sendTestPush(endpoint: unknown): Promise<PushActionResult> {
  try {
    const userId = await requireActionUserId();
    const sender = serverSender();
    if (!sender) return { ok: false, message: NOT_CONFIGURED, code: "config" };
    const ep = cleanEndpoint(endpoint);
    if (!ep) return { ok: false, message: "Pengingat belum menyala di perangkat ini.", code: "invalid" };
    const result = await sendTestTo(userId, ep, sender);
    const status = await statusFor(userId, ep);
    switch (result) {
      case "sent":
        return { ok: true, status, message: "🔔 Notifikasi tes dikirim. Muncul dalam beberapa detik." };
      case "too-soon":
        return { ok: true, status, message: "Tes baru saja dikirim. Tunggu sebentar sebelum mencoba lagi." };
      case "not-found":
        return { ok: false, message: "Pengingat belum menyala di perangkat ini.", code: "invalid" };
      case "gone":
        return { ok: false, message: "Langganan di perangkat ini sudah kedaluwarsa. Nyalakan ulang, ya.", code: "invalid" };
      default:
        return { ok: false, message: "Layanan notifikasi browser sedang tidak bisa dihubungi. Coba lagi nanti.", code: "error" };
    }
  } catch (error) {
    return fail(error);
  }
}
