import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_WINDOW_DAYS, wibDay, wibDayDate } from "@/lib/game";
import { MAX_PLACE_LIMITS, parsePlaceLimits } from "@/lib/place-limits";
import { normalizePlaceName } from "@/lib/places";
import { isMissingTable, knownMissing, noteMissingTable, readOrMissing } from "@/lib/db-missing";
import {
  EMPTY_SYNC_DATA,
  VILLAGE_STATE_KEYS,
  cleanNoSpendDays,
  cleanPlaceName,
  importableLimits,
  isTerminalTour,
  noSpendAllowed,
  parseLetterKey,
  parseMail,
  parseSeen,
  parseTour,
  type Seen,
  type StoredTour,
  type SyncOp,
  type VillageSync,
  type VillageSyncData
} from "@/lib/village-sync";

/**
 * Data desa per user di database (HANYA server; jangan diimpor dari kode client). Aturannya sama
 * dengan applySyncOp di lib/village-sync.ts, hanya saja ditulis sebagai query yang aman dijalankan
 * bersamaan dari beberapa perangkat:
 * - NoSpendDay: tandai = createMany skipDuplicates (hanya hari ini..2 hari lalu), batalkan = deleteMany.
 * - PlaceSpendLimit: upsert/hapus per (userId, placeKey); tempat baru ditolak kalau sudah 50.
 * - VillageState: "letter" ditimpa, "seen" GREATEST per angka, "tour" selesai/dilewati tidak ditimpa
 *   "active" kecuali tur diulang, "mail" (penanda kiriman Pak Pos) GREATEST.
 * Tabel baru ber-userId NOT NULL: selalu `{ userId }`, bukan userOwnedWhere.
 */

/** Label untuk knownMissing / noteMissingTable (lib/db-missing.ts). */
export const VILLAGE_SYNC_TABLES = "NoSpendDay/PlaceSpendLimit/VillageState";

const jsonValue = (v: string | Seen | StoredTour) => v as unknown as Prisma.InputJsonValue;

/**
 * Untuk buildSnapshot & syncVillage. Tabel belum ada (migrasi tepira belum jalan) → data kosong +
 * available:false: desa jalan dari perangkat ini, tidak pernah crash.
 */
export async function loadVillageSync(userId: string, now = Date.now()): Promise<VillageSync> {
  const today = wibDay(now);
  const { value, missing } = await readOrMissing(VILLAGE_SYNC_TABLES, () => readVillageSync(userId, today), null);
  return value && !missing ? { ...value, available: true, at: now } : { ...EMPTY_SYNC_DATA, available: false, at: now };
}

async function readVillageSync(userId: string, today: number): Promise<VillageSyncData> {
  const [days, limits, flags] = await Promise.all([
    prisma.noSpendDay.findMany({
      where: { userId, day: { gte: wibDayDate(today - ACTIVITY_WINDOW_DAYS + 1) } },
      select: { day: true },
      orderBy: { day: "asc" }
    }),
    prisma.placeSpendLimit.findMany({
      where: { userId },
      select: { placeName: true, monthlyLimit: true },
      orderBy: [{ createdAt: "asc" }, { placeKey: "asc" }],
      take: MAX_PLACE_LIMITS
    }),
    prisma.villageState.findMany({
      where: { userId, key: { in: [...VILLAGE_STATE_KEYS] } },
      select: { key: true, value: true }
    })
  ]);
  const flag = (key: string) => flags.find((f) => f.key === key)?.value;
  return {
    noSpend: cleanNoSpendDays(days.map((d) => wibDay(d.day)), today),
    // Kunci indeks ("0", "1", …) menjaga urutan baris; parsePlaceLimits menormalkan ulang dari nama.
    placeLimits: parsePlaceLimits(
      Object.fromEntries(limits.map((l, i) => [String(i), { name: l.placeName, limit: l.monthlyLimit }]))
    ),
    letter: parseLetterKey(flag("letter")),
    seen: parseSeen(flag("seen")),
    tour: parseTour(flag("tour")),
    mail: parseMail(flag("mail"))
  };
}

/**
 * Terapkan op (sudah lewat parseSyncOps) berurutan. Semua op idempoten, jadi kalau gagal di tengah
 * jalan, mengulang seluruh daftar aman. false = tabelnya belum ada (tidak ada yang tersimpan; op
 * dipegang browser dulu); error lain dilempar.
 */
export async function applyVillageOps(userId: string, ops: readonly SyncOp[], now = Date.now()): Promise<boolean> {
  if (!ops.length) return true;
  if (knownMissing(VILLAGE_SYNC_TABLES, now)) return false;
  const today = wibDay(now);
  try {
    for (const op of ops) await applyOne(userId, op, today);
    return true;
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    noteMissingTable(VILLAGE_SYNC_TABLES, now);
    return false;
  }
}

async function applyOne(userId: string, op: SyncOp, today: number) {
  switch (op.t) {
    case "nospend":
      if (!op.on) {
        await prisma.noSpendDay.deleteMany({ where: { userId, day: wibDayDate(op.day) } });
      } else if (noSpendAllowed(op.day, today)) {
        await prisma.noSpendDay.createMany({ data: [{ userId, day: wibDayDate(op.day) }], skipDuplicates: true });
      }
      return;
    case "limit":
      await setPlaceSpendLimit(userId, op.name, op.limit);
      return;
    case "letter":
      await prisma.villageState.upsert({
        where: { userId_key: { userId, key: "letter" } },
        create: { userId, key: "letter", value: jsonValue(op.key) },
        update: { value: jsonValue(op.key) }
      });
      return;
    case "seen":
      await raiseSeen(userId, op);
      return;
    case "mail":
      await raiseMail(userId, op.occ);
      return;
    case "tour": {
      const tour: StoredTour = { status: op.status, step: op.step };
      if (op.restart || op.status !== "active") {
        await prisma.villageState.upsert({
          where: { userId_key: { userId, key: "tour" } },
          create: { userId, key: "tour", value: jsonValue(tour) },
          update: { value: jsonValue(tour) }
        });
      } else {
        await writeTourUnlessFinished(userId, tour);
      }
      return;
    }
    case "import": {
      const days = op.noSpend.filter((d) => d > today - ACTIVITY_WINDOW_DAYS && d <= today);
      if (days.length) {
        await prisma.noSpendDay.createMany({
          data: days.map((d) => ({ userId, day: wibDayDate(d) })),
          skipDuplicates: true
        });
      }
      if (op.limits.length) {
        const existing = await prisma.placeSpendLimit.findMany({ where: { userId }, select: { placeKey: true } });
        const add = importableLimits(new Set(existing.map((r) => r.placeKey)), op.limits);
        if (add.length) {
          await prisma.placeSpendLimit.createMany({
            data: add.map((l) => ({
              userId,
              placeKey: normalizePlaceName(l.name),
              placeName: cleanPlaceName(l.name),
              monthlyLimit: l.limit
            })),
            skipDuplicates: true
          });
        }
      }
      if (op.letter) {
        await prisma.villageState.createMany({
          data: [{ userId, key: "letter", value: jsonValue(op.letter) }],
          skipDuplicates: true
        });
      }
      if (op.seen) await raiseSeen(userId, op.seen);
      if (op.tour) {
        if (isTerminalTour(op.tour)) {
          await writeTourUnlessFinished(userId, op.tour);
        } else {
          await prisma.villageState.createMany({
            data: [{ userId, key: "tour", value: jsonValue(op.tour) }],
            skipDuplicates: true
          });
        }
      }
      return;
    }
  }
}

/** Pasang/ganti (rupiah bulat) atau hapus (null) batas jajan satu tempat. Tempat ke-51 diabaikan. */
async function setPlaceSpendLimit(userId: string, name: string, limit: number | null) {
  const placeName = cleanPlaceName(name);
  const placeKey = normalizePlaceName(placeName);
  if (!placeKey) return;
  if (limit === null) {
    await prisma.placeSpendLimit.deleteMany({ where: { userId, placeKey } });
    return;
  }
  // Hitungan di transaksi yang sama; balapan dua perangkat paling-paling lebih satu, tidak apa-apa.
  await prisma.$transaction(async (tx) => {
    const where = { userId_placeKey: { userId, placeKey } };
    const exists = await tx.placeSpendLimit.findUnique({ where, select: { placeKey: true } });
    if (!exists && (await tx.placeSpendLimit.count({ where: { userId } })) >= MAX_PLACE_LIMITS) return;
    await tx.placeSpendLimit.upsert({
      where,
      create: { userId, placeKey, placeName, monthlyLimit: limit },
      update: { placeName, monthlyLimit: limit }
    });
  });
}

// SQL mentah harus mengisi createdAt/updatedAt sendiri (updatedAt tanpa default di database). Kolomnya
// TIMESTAMP tanpa zona berisi UTC (seperti yang ditulis Prisma), jadi pakai waktu UTC eksplisit: CURRENT_TIMESTAMP
// polos (atau Date sebagai parameter) ikut zona waktu sesi database dan bisa bergeser 7 jam.

/** "seen" = maksimum per angka, atomik di database (dua perangkat merayakan bersamaan tidak saling menurunkan). */
async function raiseSeen(userId: string, seen: Seen) {
  await prisma.$executeRaw`
    INSERT INTO "VillageState" ("userId", "key", "value", "createdAt", "updatedAt")
    VALUES (${userId}, 'seen', ${JSON.stringify({ villagers: seen.villagers, level: seen.level })}::jsonb,
      (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
    ON CONFLICT ("userId", "key") DO UPDATE SET
      "value" = jsonb_build_object(
        'villagers', GREATEST(${seen.villagers}::int, CASE WHEN jsonb_typeof("VillageState"."value"->'villagers') = 'number'
          THEN floor(("VillageState"."value"->>'villagers')::numeric) ELSE 0 END),
        'level', GREATEST(${seen.level}::int, CASE WHEN jsonb_typeof("VillageState"."value"->'level') = 'number'
          THEN floor(("VillageState"."value"->>'level')::numeric) ELSE 0 END)
      ),
      "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')`;
}

/** Penanda kiriman Pak Pos = maksimum, atomik (HP & laptop mengumumkan bersamaan tidak saling menurunkan). */
async function raiseMail(userId: string, occ: number) {
  await prisma.$executeRaw`
    INSERT INTO "VillageState" ("userId", "key", "value", "createdAt", "updatedAt")
    VALUES (${userId}, 'mail', ${JSON.stringify({ occ })}::jsonb,
      (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
    ON CONFLICT ("userId", "key") DO UPDATE SET
      "value" = jsonb_build_object('occ', GREATEST(${occ}::int, CASE WHEN jsonb_typeof("VillageState"."value"->'occ') = 'number'
        THEN floor(("VillageState"."value"->>'occ')::numeric) ELSE 0 END)),
      "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')`;
}

/** Tulis tur kecuali yang tersimpan sudah selesai/dilewati (tur di perangkat lain sudah ditutup). */
async function writeTourUnlessFinished(userId: string, tour: StoredTour) {
  await prisma.$executeRaw`
    INSERT INTO "VillageState" ("userId", "key", "value", "createdAt", "updatedAt")
    VALUES (${userId}, 'tour', ${JSON.stringify({ status: tour.status, step: tour.step })}::jsonb,
      (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
    ON CONFLICT ("userId", "key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    WHERE COALESCE("VillageState"."value"->>'status', '') NOT IN ('done', 'skipped')`;
}

// ── Untuk cron pengingat & fitur lain ────────────────────────────────────────

/**
 * Apakah user menandai hari WIB `day` (lihat wibDay) sebagai nol pengeluaran. Tabel belum ada →
 * false. Tanda yang masih menunggu di outbox browser (offline) belum terlihat di sini.
 */
export async function hasNoSpendMark(userId: string, day: number): Promise<boolean> {
  const where = { userId_day: { userId, day: wibDayDate(day) } };
  const { value } = await readOrMissing(
    "NoSpendDay",
    () => prisma.noSpendDay.findUnique({ where, select: { userId: true } }),
    null
  );
  return value !== null;
}

/** Versi banyak user sekaligus: userId mana saja (dari `userIds`) yang menandai hari `day`. Tabel belum ada → kosong. */
export async function noSpendMarkedUserIds(userIds: readonly string[], day: number): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const where = { userId: { in: [...userIds] }, day: wibDayDate(day) };
  const { value } = await readOrMissing(
    "NoSpendDay",
    () => prisma.noSpendDay.findMany({ where, select: { userId: true } }),
    []
  );
  return new Set(value.map((r) => r.userId));
}
