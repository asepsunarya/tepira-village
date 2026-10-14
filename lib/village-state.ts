import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_WINDOW_DAYS, wibDay, wibDayDate } from "@/lib/game";
import { MAX_PLACE_LIMITS, parsePlaceLimits } from "@/lib/place-limits";
import { normalizePlaceName } from "@/lib/places";
import { isMissingTable, knownMissing, noteMissingTable, readOrMissing } from "@/lib/db-missing";
import {
  EMPTY_SYNC_DATA,
  MAX_REMOVED_MARKS,
  REMOVED_KEY_PREFIX,
  VILLAGE_STATE_KEYS,
  cleanNoSpendDays,
  cleanPlaceName,
  importableLimits,
  isTerminalTour,
  noSpendOpAllowed,
  notRemovedLimits,
  parseLetterKey,
  parseMail,
  parseRemovedKeys,
  parseSeen,
  parseTour,
  removedDayKey,
  removedPlaceKey,
  type RemovedMarks,
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
 * - NoSpendDay: tandai = createMany skipDuplicates (made-2..made, lihat noSpendOpAllowed), batalkan = deleteMany.
 * - PlaceSpendLimit: upsert/hapus per (userId, placeKey); tempat baru ditolak kalau sudah 50.
 * - VillageState: "letter" ditimpa, "seen" GREATEST per angka, "tour" selesai/dilewati tidak ditimpa
 *   "active" kecuali tur diulang, "mail" (penanda kiriman Pak Pos) GREATEST, dan "rm:n:<hari>" /
 *   "rm:p:<tempat>" = batal nol pengeluaran / hapus batas (supaya impor v1 tidak menghidupkannya lagi).
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
  const [days, limits, flags, removed] = await Promise.all([
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
    }),
    readRemoved(userId, today)
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
    mail: parseMail(flag("mail")),
    removed
  };
}

/** Yang sengaja dihapus user (baris VillageState "rm:…"), terbaru dulu, maks MAX_REMOVED_MARKS per jenis. */
async function readRemoved(userId: string, today: number): Promise<RemovedMarks> {
  const rows = await prisma.villageState.findMany({
    where: { userId, key: { startsWith: REMOVED_KEY_PREFIX } },
    select: { key: true },
    orderBy: { updatedAt: "desc" },
    take: MAX_REMOVED_MARKS * 2
  });
  return parseRemovedKeys(rows.map((r) => r.key), today);
}

/** Tandai (true) / hapus (false) satu tanda "sengaja dihapus". */
async function setRemoved(userId: string, key: string, removed: boolean) {
  if (removed) {
    await prisma.villageState.createMany({ data: [{ userId, key, value: true }], skipDuplicates: true });
  } else {
    await prisma.villageState.deleteMany({ where: { userId, key } });
  }
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
        await setRemoved(userId, removedDayKey(op.day), true);
      } else if (noSpendOpAllowed(op, today)) {
        // Batas mundur dihitung dari hari op dibuat (made), bukan hari ini: tanda yang lama menunggu di
        // outbox (offline, tabel belum ada) tetap tersimpan.
        await prisma.noSpendDay.createMany({ data: [{ userId, day: wibDayDate(op.day) }], skipDuplicates: true });
        await setRemoved(userId, removedDayKey(op.day), false);
      }
      return;
    case "limit": {
      const stored = await setPlaceSpendLimit(userId, op.name, op.limit);
      const placeKey = normalizePlaceName(cleanPlaceName(op.name));
      if (stored && placeKey) await setRemoved(userId, removedPlaceKey(placeKey), op.limit === null);
      return;
    }
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
        // ❓ = tur diulang dengan sengaja: ditandai supaya impor v1 dari perangkat lain tidak menutupnya.
        if (op.restart && op.status === "active") tour.restarted = true;
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
      // Impor tidak menghidupkan lagi yang sengaja dihapus di akun (dari perangkat mana pun).
      const removed = op.noSpend.length || op.limits.length ? await readRemoved(userId, today) : EMPTY_SYNC_DATA.removed;
      const days = op.noSpend.filter((d) => d > today - ACTIVITY_WINDOW_DAYS && d <= today && !removed.days.includes(d));
      if (days.length) {
        await prisma.noSpendDay.createMany({
          data: days.map((d) => ({ userId, day: wibDayDate(d) })),
          skipDuplicates: true
        });
      }
      const limits = notRemovedLimits(removed, op.limits);
      if (limits.length) {
        const existing = await prisma.placeSpendLimit.findMany({ where: { userId }, select: { placeKey: true } });
        const add = importableLimits(new Set(existing.map((r) => r.placeKey)), limits);
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
      if (op.letter) await importLetter(userId, op.letter);
      if (op.seen) await raiseSeen(userId, op.seen);
      if (op.tour) {
        if (isTerminalTour(op.tour)) {
          await closeTourFromImport(userId, op.tour);
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

/**
 * Pasang/ganti (rupiah bulat) atau hapus (null) batas jajan satu tempat. Tempat ke-51 diabaikan.
 * true = tersimpan (dipasang, diganti, atau dihapus); false = ditolak (nama kosong / sudah 50 tempat).
 */
async function setPlaceSpendLimit(userId: string, name: string, limit: number | null): Promise<boolean> {
  const placeName = cleanPlaceName(name);
  const placeKey = normalizePlaceName(placeName);
  if (!placeKey) return false;
  if (limit === null) {
    await prisma.placeSpendLimit.deleteMany({ where: { userId, placeKey } });
    return true;
  }
  // Hitungan di transaksi yang sama; balapan dua perangkat paling-paling lebih satu, tidak apa-apa.
  return prisma.$transaction(async (tx) => {
    const where = { userId_placeKey: { userId, placeKey } };
    const exists = await tx.placeSpendLimit.findUnique({ where, select: { placeKey: true } });
    if (!exists && (await tx.placeSpendLimit.count({ where: { userId } })) >= MAX_PLACE_LIMITS) return false;
    await tx.placeSpendLimit.upsert({
      where,
      create: { userId, placeKey, placeName, monthlyLimit: limit },
      update: { placeName, monthlyLimit: limit }
    });
    return true;
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

/**
 * Langkah tur ("active" biasa): ditulis kecuali yang tersimpan sudah selesai/dilewati (tur di perangkat
 * lain sudah ditutup). Tanda "diulang lewat ❓" pada tur yang sedang jalan dipertahankan.
 */
async function writeTourUnlessFinished(userId: string, tour: StoredTour) {
  await prisma.$executeRaw`
    INSERT INTO "VillageState" ("userId", "key", "value", "createdAt", "updatedAt")
    VALUES (${userId}, 'tour', ${JSON.stringify({ status: tour.status, step: tour.step })}::jsonb,
      (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
    ON CONFLICT ("userId", "key") DO UPDATE SET
      "value" = EXCLUDED."value" || CASE
        WHEN "VillageState"."value"->>'status' = 'active' AND "VillageState"."value"->'restarted' = 'true'::jsonb
        THEN '{"restarted": true}'::jsonb ELSE '{}'::jsonb END,
      "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    WHERE COALESCE("VillageState"."value"->>'status', '') NOT IN ('done', 'skipped')`;
}

/**
 * Impor: tur yang selesai/dilewati di perangkat lama menutup tur yang masih "active" di akun, KECUALI
 * tur itu diulang dengan sengaja lewat ❓ (restarted) setelahnya.
 */
async function closeTourFromImport(userId: string, tour: StoredTour) {
  await prisma.$executeRaw`
    INSERT INTO "VillageState" ("userId", "key", "value", "createdAt", "updatedAt")
    VALUES (${userId}, 'tour', ${JSON.stringify({ status: tour.status, step: tour.step })}::jsonb,
      (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
    ON CONFLICT ("userId", "key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    WHERE COALESCE("VillageState"."value"->>'status', '') NOT IN ('done', 'skipped')
      AND NOT COALESCE("VillageState"."value"->>'status' = 'active' AND "VillageState"."value"->'restarted' = 'true'::jsonb, false)`;
}

/**
 * Impor surat: diisi kalau akun belum punya, atau diganti kalau yang diimpor lebih baru (kunci sejenis,
 * angka lebih besar; sama dengan newerLetterKey). Bukan "perangkat yang mengimpor duluan menang". Isi
 * lama yang rusak dianggap belum ada (sama dengan parseLetterKey yang mengembalikan null di browser).
 * CASE menjamin urutan: ::bigint hanya dihitung untuk kunci yang sah. SQL-nya sengaja ASCII saja.
 */
async function importLetter(userId: string, letter: string) {
  await prisma.$executeRaw`
    INSERT INTO "VillageState" ("userId", "key", "value", "createdAt", "updatedAt")
    VALUES (${userId}, 'letter', to_jsonb(${letter}::text),
      (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
    ON CONFLICT ("userId", "key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    WHERE CASE
      WHEN jsonb_typeof("VillageState"."value") <> 'string' OR ("VillageState"."value" #>> '{}') !~ '^[iw][0-9]{1,12}$' THEN true
      WHEN left("VillageState"."value" #>> '{}', 1) <> left(EXCLUDED."value" #>> '{}', 1) THEN false
      ELSE substr("VillageState"."value" #>> '{}', 2)::bigint < substr(EXCLUDED."value" #>> '{}', 2)::bigint
    END`;
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
