import { prisma } from "@/lib/prisma";
import { MISSING_TABLE_MESSAGE, isMissingTable, knownMissing, noteMissingTable, readOrMissing } from "@/lib/db-missing";
import { cleanUserAgent, deviceLabel, type ParsedSubscription } from "@/lib/push-subscription";
import {
  DEFAULT_REMINDER_PREFS,
  MAX_DEVICES_PER_USER,
  MAX_PUSH_FAILURES,
  classifyPushStatus,
  testMessage,
  topicFor,
  ttlFor,
  type ReminderPrefs,
  type ReminderStatus,
  type Sender
} from "@/lib/reminders";

/**
 * Langganan push & pilihan pengingat di database (HANYA server). Tabelnya milik migrasi tepira
 * (WebPushSubscription: satu baris per browser, endpoint unik; ReminderPreference: satu baris per
 * user). userId NOT NULL: selalu `{ userId }`, bukan userOwnedWhere. Tabel belum ada: baca → status
 * "belum tersedia", tulis → MISSING_TABLE_MESSAGE.
 */

/** Label untuk knownMissing / noteMissingTable (lib/db-missing.ts). */
export const PUSH_TABLES = "WebPushSubscription/ReminderPreference";

/** "Kirim tes" paling sering sekali per sekian ms per perangkat. */
export const TEST_COOLDOWN_MS = 15_000;

async function writeGuard<T>(fn: () => Promise<T>): Promise<T> {
  if (knownMissing(PUSH_TABLES)) throw new Error(MISSING_TABLE_MESSAGE);
  try {
    return await fn();
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    noteMissingTable(PUSH_TABLES);
    throw new Error(MISSING_TABLE_MESSAGE);
  }
}

export const NO_PUSH_STATUS: ReminderStatus = Object.freeze({
  available: false,
  configured: false,
  registered: false,
  prefs: DEFAULT_REMINDER_PREFS,
  devices: []
});

/** Pilihan akun + perangkat terdaftar. `endpoint` = langganan browser ini (null kalau belum ada). */
export async function loadReminderStatus(
  userId: string,
  endpoint: string | null,
  configured: boolean
): Promise<ReminderStatus> {
  const { value } = await readOrMissing(
    PUSH_TABLES,
    async () => {
      const pref = await prisma.reminderPreference.findUnique({
        where: { userId },
        select: { lampReminder: true, billReminder: true }
      });
      const subs = await prisma.webPushSubscription.findMany({
        where: { userId },
        select: { id: true, endpoint: true, userAgent: true, lastSuccessAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: MAX_DEVICES_PER_USER
      });
      return { pref, subs };
    },
    null
  );
  if (!value) return { ...NO_PUSH_STATUS, configured };
  const devices = value.subs.map((s) => ({
    id: s.id,
    label: deviceLabel(s.userAgent),
    here: endpoint !== null && s.endpoint === endpoint,
    lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null
  }));
  return {
    available: true,
    configured,
    registered: devices.some((d) => d.here),
    prefs: value.pref ?? DEFAULT_REMINDER_PREFS,
    devices
  };
}

/**
 * Simpan langganan browser ini untuk `userId`. Upsert per endpoint dan PINDAHKAN ke user ini: browser
 * bersama yang berganti akun tidak terus mengabari akun sebelumnya. Baris pilihan dibuat kalau belum ada
 * (default nyala). Satu akun maks MAX_DEVICES_PER_USER perangkat; yang paling lama tidak muncul dibuang.
 */
export async function saveSubscription(userId: string, sub: ParsedSubscription, userAgent: string | null) {
  const ua = cleanUserAgent(userAgent);
  await writeGuard(async () => {
    const data = { userId, p256dh: sub.p256dh, auth: sub.auth, expirationTime: sub.expirationTime, userAgent: ua };
    await prisma.webPushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      // Browser yang membuka desa = hidup: hitungan gagal mulai dari nol lagi.
      update: { ...data, failureCount: 0, lastFailureAt: null },
      create: { ...data, endpoint: sub.endpoint }
    });
    await prisma.reminderPreference.createMany({ data: [{ userId }], skipDuplicates: true });
    const extra = await prisma.webPushSubscription.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: MAX_DEVICES_PER_USER,
      select: { id: true }
    });
    if (extra.length) {
      await prisma.webPushSubscription.deleteMany({ where: { userId, id: { in: extra.map((e) => e.id) } } });
    }
  });
}

/** Hapus langganan browser ini (Matikan, keluar akun, izin dicabut). Hanya milik user ini. */
export async function removeSubscription(userId: string, endpoint: string) {
  return writeGuard(async () => (await prisma.webPushSubscription.deleteMany({ where: { userId, endpoint } })).count);
}

/** Hapus perangkat lain milik akun ini dari daftar (mis. HP lama). */
export async function forgetDevice(userId: string, id: number) {
  return writeGuard(async () => (await prisma.webPushSubscription.deleteMany({ where: { userId, id } })).count);
}

/** Ubah pilihan akun. Menyalakan lagi di hari yang sama tidak mengirim ulang yang sudah terkirim hari itu. */
export async function setReminderPrefs(userId: string, prefs: Partial<ReminderPrefs>): Promise<ReminderPrefs> {
  const data: Partial<ReminderPrefs> = {};
  if (typeof prefs.lampReminder === "boolean") data.lampReminder = prefs.lampReminder;
  if (typeof prefs.billReminder === "boolean") data.billReminder = prefs.billReminder;
  return writeGuard(() =>
    prisma.reminderPreference.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
      select: { lampReminder: true, billReminder: true }
    })
  );
}

export type TestPushResult = "sent" | "gone" | "failed" | "not-found" | "too-soon";

/** Satu notifikasi tes ke langganan browser ini saja (harus milik user ini). */
export async function sendTestTo(userId: string, endpoint: string, sender: Sender, now = Date.now()): Promise<TestPushResult> {
  const sub = await writeGuard(() =>
    prisma.webPushSubscription.findFirst({
      where: { userId, endpoint },
      select: { id: true, endpoint: true, p256dh: true, auth: true, lastSuccessAt: true }
    })
  );
  if (!sub) return "not-found";
  if (sub.lastSuccessAt && now - sub.lastSuccessAt.getTime() < TEST_COOLDOWN_MS) return "too-soon";
  const payload = testMessage();
  const outcome = await sender(sub, payload, { ttl: ttlFor("test", now), topic: topicFor(payload), urgency: "high" });
  const at = new Date(now);
  if (outcome.ok) {
    await prisma.webPushSubscription.updateMany({ where: { id: sub.id }, data: { failureCount: 0, lastSuccessAt: at } });
    return "sent";
  }
  if (classifyPushStatus(outcome.statusCode).delivery === "gone") {
    await prisma.webPushSubscription.deleteMany({ where: { id: sub.id } });
    return "gone";
  }
  await prisma.webPushSubscription.updateMany({
    where: { id: sub.id },
    data: { failureCount: { increment: 1 }, lastFailureAt: at }
  });
  await prisma.webPushSubscription.deleteMany({ where: { id: sub.id, failureCount: { gte: MAX_PUSH_FAILURES } } });
  return "failed";
}
