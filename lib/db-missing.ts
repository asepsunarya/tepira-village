/**
 * Jaring pengaman urutan rilis. Tabel khusus desa (NoSpendDay, PlaceSpendLimit, VillageState,
 * RecurringTransaction, RecurringOccurrence, WebPushSubscription, ReminderPreference) dibuat oleh
 * migrasi di repo tepira. Kalau desa sempat ter-deploy sebelum migrasi itu jalan di produksi:
 * - BACA tabel baru → anggap kosong + tandai "belum tersedia" (desa tetap jalan, jangan crash);
 * - TULIS ke tabel baru → gagal dengan pesan ramah (MISSING_TABLE_MESSAGE).
 *
 * Sengaja tanpa import Prisma: dikenali dari nama kelas & kode error, jadi bisa dites tanpa database.
 */

/** P2021 = tabel tidak ada, P2022 = kolom tidak ada (query model Prisma). */
const MISSING_PRISMA_CODES = new Set(["P2021", "P2022"]);
/** $queryRaw / $executeRaw gagal (P2010) dengan kode Postgres undefined_table / undefined_column. */
const MISSING_PG_CODES = new Set(["42P01", "42703"]);

export function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: unknown; code?: unknown; meta?: unknown };
  if (e.name !== "PrismaClientKnownRequestError" || typeof e.code !== "string") return false;
  if (MISSING_PRISMA_CODES.has(e.code)) return true;
  const pg = e.meta && typeof e.meta === "object" ? (e.meta as { code?: unknown }).code : undefined;
  return e.code === "P2010" && typeof pg === "string" && MISSING_PG_CODES.has(pg);
}

/** Untuk server action yang menulis ke tabel baru. Tanpa detail teknis: tampil apa adanya di desa. */
export const MISSING_TABLE_MESSAGE =
  "Fitur ini belum siap di server (tabel database-nya belum dibuat). Datamu aman, coba lagi nanti, ya.";

/**
 * Setelah ketahuan belum ada, tabel itu tidak ditanya lagi selama ini: tiap query yang gagal ikut
 * dicatat Prisma sebagai error di log, dan snapshot dibangun di setiap aksi. Begitu migrasi jalan,
 * paling lambat selama ini kemudian fiturnya hidup sendiri.
 */
export const MISSING_RECHECK_MS = 60_000;

const missingUntil = new Map<string, number>();
const warned = new Set<string>();

/** `what` = label bebas (mis. "NoSpendDay/PlaceSpendLimit/VillageState"), sama dengan saat noteMissingTable. */
export function knownMissing(what: string, now = Date.now()) {
  return (missingUntil.get(what) ?? 0) > now;
}

/** Catat tabel belum ada: dilewati selama MISSING_RECHECK_MS, satu peringatan per proses server. */
export function noteMissingTable(what: string, now = Date.now()) {
  missingUntil.set(what, now + MISSING_RECHECK_MS);
  if (warned.has(what)) return;
  warned.add(what);
  console.warn(`[desa] tabel ${what} belum ada (migrasi tepira belum dijalankan?). Untuk sementara dianggap kosong.`);
}

/**
 * Baca dari tabel yang mungkin belum ada: error "tabel/kolom tidak ada" → `fallback` + missing:true,
 * error lain tetap dilempar. Selama tabelnya baru saja ketahuan belum ada, query dilewati.
 */
export async function readOrMissing<T>(
  what: string,
  read: () => Promise<T>,
  fallback: T
): Promise<{ value: T; missing: boolean }> {
  if (knownMissing(what)) return { value: fallback, missing: true };
  try {
    return { value: await read(), missing: false };
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    noteMissingTable(what);
    return { value: fallback, missing: true };
  }
}

/** Untuk blok tulis: ganti error "tabel belum ada" dengan pesan ramah, error lain apa adanya. */
export function friendlyDbError(error: unknown): unknown {
  return isMissingTable(error) ? new Error(MISSING_TABLE_MESSAGE) : error;
}
