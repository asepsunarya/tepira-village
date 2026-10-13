import { ACTIVITY_WINDOW_DAYS, NOSPEND_BACKFILL_DAYS } from "@/lib/game";
import {
  MAX_LIMIT,
  MAX_PLACE_LIMITS,
  NO_LIMITS,
  parsePlaceLimits,
  withPlaceLimit,
  type PlaceLimit,
  type PlaceLimits
} from "@/lib/place-limits";
import { normalizePlaceName } from "@/lib/places";

/**
 * Data desa per user yang ikut pindah antar perangkat: tanda nol pengeluaran, batas jajan per tempat,
 * surat yang terakhir dibuka, warga/level yang sudah dirayakan, dan progres tur. Modul murni (tanpa
 * Prisma, tanpa window): dipakai server (lib/village-state.ts), store, dan tes, supaya tampilan di
 * browser = hasil yang nanti dihitung server.
 *
 * Penyimpanan di database (tabel milik repo tepira):
 * - `NoSpendDay`      satu baris per hari WIB yang ditandai
 * - `PlaceSpendLimit` satu baris per tempat (placeKey = normalizePlaceName(nama))
 * - `VillageState`    kunci → JSON: "letter" (tulisan terakhir menang), "seen" (maksimum per angka),
 *                     "tour" (selesai/dilewati tidak ditimpa "active" kecuali tur diulang lewat ❓),
 *                     "mail" (kiriman Pak Pos terakhir yang sudah diumumkan, maksimum)
 *
 * Browser mengirim perubahan sebagai op kecil yang idempoten (nilai mutlak, bukan "toggle"), jadi
 * op yang terkirim dua kali (respons hilang, dua tab) tidak merusak apa pun.
 */

// ── Tipe tur & perayaan (dulu di components/; lib tidak boleh mengimpor components) ──────────
export type TourStatus = "active" | "done" | "skipped";

export interface StoredTour {
  status: TourStatus;
  step: number;
}

/** Langkah 0 = sambutan, 1..TOUR_LAST_STEP = langkah bernomor (progres "n/8"). */
export const TOUR_LAST_STEP = 8;

export const clampTourStep = (step: number) =>
  Math.max(0, Math.min(TOUR_LAST_STEP, Number.isFinite(step) ? Math.floor(step) : 0));

export const isTerminalTour = (t: StoredTour | null | undefined) => t?.status === "done" || t?.status === "skipped";

/** Warga & level yang sudah dirayakan (supaya perayaan tidak muncul dua kali). */
export interface Seen {
  villagers: number;
  level: number;
}

// ── Bentuk data ──────────────────────────────────────────────────────────────
/** Kunci VillageState yang dipakai desa. Kunci lain di tabel itu diabaikan. */
export const VILLAGE_STATE_KEYS = ["letter", "seen", "tour", "mail"] as const;
export type VillageStateKey = (typeof VILLAGE_STATE_KEYS)[number];

export interface VillageSyncData {
  /** hari WIB (wibDay) bertanda nol pengeluaran: unik, urut naik, dalam jendela aktivitas */
  noSpend: number[];
  /** kunci = normalizePlaceName(nama), maksimal MAX_PLACE_LIMITS */
  placeLimits: PlaceLimits;
  /** letterKey surat yang terakhir dibuka */
  letter: string | null;
  /** null = belum pernah (perayaan pertama hanya mencatat diam-diam) */
  seen: Seen | null;
  tour: StoredTour | null;
  /**
   * id RecurringOccurrence tertinggi yang sudah diumumkan Pak Pos (tagihan baru / tercatat otomatis);
   * null = belum pernah. Hanya naik, jadi kiriman yang diumumkan di HP tidak diumumkan lagi di laptop.
   */
  mail: number | null;
}

export interface VillageSync extends VillageSyncData {
  /**
   * false = tabel sinkron belum ada (migrasi tepira belum jalan) atau desa contoh landing. Desa
   * tetap jalan dari perangkat ini; perubahan menunggu di outbox sampai server siap.
   */
  available: boolean;
  /** waktu server (ms) saat data dibaca: dari dua salinan, yang lebih baru menang */
  at: number;
}

export const EMPTY_SYNC_DATA: VillageSyncData = Object.freeze({
  noSpend: [],
  placeLimits: NO_LIMITS,
  letter: null,
  seen: null,
  tour: null,
  mail: null
}) as VillageSyncData;

/** Tanpa server: desa contoh, atau belum pernah tersambung. */
export const LOCAL_SYNC: VillageSync = Object.freeze({ ...EMPTY_SYNC_DATA, available: false, at: 0 }) as VillageSync;

// ── Op ───────────────────────────────────────────────────────────────────────
export const MAX_OPS_PER_CALL = 100;
/**
 * Batas aman outbox di browser. Setelah diringkas satu op per kunci, isinya jauh di bawah ini (hari
 * yang bisa ditandai, maks 50 tempat, satu op surat/perayaan/tur, beberapa impor).
 */
export const MAX_OUTBOX = 1_000;
/** Sama dengan batas placeName pengeluaran (parsePlace di app/village/actions.ts). */
export const MAX_PLACE_NAME = 120;
const OP_ID = /^[a-z0-9]{1,16}$/;
/** letterKey(): i<insightId> | w<hari Senin WIB> */
const LETTER_KEY = /^[iw]\d{1,12}$/;
/** Batas wajar supaya JSON aneh tidak masuk ke VillageState. */
const MAX_SEEN_LEVEL = 9_999;
/** id SERIAL Postgres. */
const MAX_MAIL_ID = 2_147_483_647;

export type SyncOp =
  /** tandai (on) / batalkan (off) nol pengeluaran; menandai hanya hari ini & NOSPEND_BACKFILL_DAYS sebelumnya */
  | { id: string; t: "nospend"; day: number; on: boolean }
  /** pasang/ganti batas (rupiah bulat per bulan) atau hapus (null) */
  | { id: string; t: "limit"; name: string; limit: number | null }
  | { id: string; t: "letter"; key: string }
  | { id: string; t: "seen"; villagers: number; level: number }
  /** penanda kiriman Pak Pos (maksimum, tidak pernah turun) */
  | { id: string; t: "mail"; occ: number }
  /**
   * restart = tur diulang lewat ❓ (selalu menimpa). Tanpa itu, "active" tidak menimpa tur yang sudah
   * selesai/dilewati di perangkat lain. Status selesai/dilewati selalu menimpa.
   */
  | { id: string; t: "tour"; status: TourStatus; step: number; restart: boolean }
  /** impor sekali per perangkat dari kunci localStorage v1 (lihat importFromLegacy) */
  | {
      id: string;
      t: "import";
      noSpend: number[];
      limits: PlaceLimit[];
      letter: string | null;
      seen: Seen | null;
      tour: StoredTour | null;
    };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type SyncOpInput = DistributiveOmit<SyncOp, "id">;

/** Hasil server action syncVillage. ok:true HANYA kalau op benar-benar tersimpan. */
export type SyncResult =
  | { ok: true; sync: VillageSync }
  | {
      ok: false;
      /** owner = sesi sudah berganti akun; missing = tabel belum ada (tetap lokal); error = coba lagi nanti */
      code: "owner" | "missing" | "error";
      message: string;
    };

// ── Aturan ───────────────────────────────────────────────────────────────────
const isInt = (v: unknown): v is number => Number.isInteger(v);

/** Jendela hari yang disimpan/dikirim: (today - ACTIVITY_WINDOW_DAYS, today + 1]. +1 = toleransi jam perangkat. */
export const inSyncWindow = (day: number, today: number) => day > today - ACTIVITY_WINDOW_DAYS && day <= today + 1;

/** Menandai nol pengeluaran hanya untuk hari ini dan NOSPEND_BACKFILL_DAYS hari sebelumnya (membatalkan selalu boleh). */
export const noSpendAllowed = (day: number, today: number) => day <= today && day >= today - NOSPEND_BACKFILL_DAYS;

/** Spasi dirapikan seperti parsePlaceLimits; kunci = normalizePlaceName(hasil ini). */
export const cleanPlaceName = (name: string) => name.trim().replace(/\s+/g, " ");

const validLimitValue = (v: unknown): v is number => isInt(v) && v >= 1 && v <= MAX_LIMIT;

export function parseLetterKey(v: unknown): string | null {
  return typeof v === "string" && LETTER_KEY.test(v) ? v : null;
}

export function parseSeen(v: unknown): Seen | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Partial<Seen>;
  const ok = (n: unknown): n is number => isInt(n) && n >= 0 && n <= MAX_SEEN_LEVEL;
  return ok(s.villagers) && ok(s.level) ? { villagers: s.villagers, level: s.level } : null;
}

/** Penanda kiriman Pak Pos: angka (salinan browser) atau { occ } (nilai VillageState "mail"). */
export function parseMail(v: unknown): number | null {
  const n = v && typeof v === "object" && !Array.isArray(v) ? (v as { occ?: unknown }).occ : v;
  return isInt(n) && n >= 0 && n <= MAX_MAIL_ID ? n : null;
}

export function parseTour(v: unknown): StoredTour | null {
  if (!v || typeof v !== "object") return null;
  const t = v as Partial<StoredTour>;
  if (t.status !== "active" && t.status !== "done" && t.status !== "skipped") return null;
  return typeof t.step === "number" ? { status: t.status, step: clampTourStep(t.step) } : null;
}

/** Hari unik, urut naik, dalam jendela. */
export function cleanNoSpendDays(days: unknown, today: number): number[] {
  if (!Array.isArray(days)) return [];
  return [...new Set(days.filter((d): d is number => isInt(d) && inSyncWindow(d, today)))].sort((a, b) => a - b);
}

/** Bersihkan data dari sumber mana pun (salinan di localStorage bisa diubah tangan). */
export function parseSyncData(raw: unknown, today: number): VillageSyncData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_SYNC_DATA;
  const r = raw as Record<string, unknown>;
  return {
    noSpend: cleanNoSpendDays(r.noSpend, today),
    placeLimits: parsePlaceLimits(r.placeLimits),
    letter: parseLetterKey(r.letter),
    seen: parseSeen(r.seen),
    tour: parseTour(r.tour),
    mail: parseMail(r.mail)
  };
}

/** Salinan server dari localStorage: data + available + at. */
export function parseSync(raw: unknown, today: number): VillageSync | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const at = typeof r.at === "number" && Number.isFinite(r.at) ? r.at : 0;
  return { ...parseSyncData(raw, today), available: r.available === true, at };
}

function parseLimitList(v: unknown): PlaceLimit[] {
  if (!Array.isArray(v)) return [];
  const out: PlaceLimit[] = [];
  for (const e of v.slice(0, MAX_PLACE_LIMITS * 2)) {
    if (!e || typeof e !== "object") continue;
    const { name, limit } = e as Partial<PlaceLimit>;
    if (typeof name !== "string" || !validLimitValue(limit)) continue;
    const clean = cleanPlaceName(name);
    if (!normalizePlaceName(clean) || clean.length > MAX_PLACE_NAME) continue;
    out.push({ name: clean, limit });
  }
  return out.slice(-MAX_PLACE_LIMITS);
}

/**
 * Op dari luar (argumen server action, outbox di localStorage): yang rusak dibuang. Server menerima
 * maks MAX_OPS_PER_CALL per panggilan; outbox di browser boleh lebih panjang (MAX_OUTBOX).
 */
export function parseSyncOps(raw: unknown, max = MAX_OPS_PER_CALL): SyncOp[] {
  if (!Array.isArray(raw)) return [];
  const out: SyncOp[] = [];
  for (const item of raw.slice(0, max)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || !OP_ID.test(o.id)) continue;
    const id = o.id;
    switch (o.t) {
      case "nospend":
        if (isInt(o.day) && typeof o.on === "boolean") out.push({ id, t: "nospend", day: o.day, on: o.on });
        break;
      case "limit": {
        if (typeof o.name !== "string") break;
        const name = cleanPlaceName(o.name);
        if (!normalizePlaceName(name) || name.length > MAX_PLACE_NAME) break;
        if (o.limit !== null && !validLimitValue(o.limit)) break;
        out.push({ id, t: "limit", name, limit: o.limit as number | null });
        break;
      }
      case "letter": {
        const key = parseLetterKey(o.key);
        if (key) out.push({ id, t: "letter", key });
        break;
      }
      case "seen": {
        const seen = parseSeen(o);
        if (seen) out.push({ id, t: "seen", ...seen });
        break;
      }
      case "mail": {
        const occ = parseMail(o.occ);
        if (occ !== null) out.push({ id, t: "mail", occ });
        break;
      }
      case "tour": {
        const tour = parseTour(o);
        if (tour) out.push({ id, t: "tour", ...tour, restart: o.restart === true });
        break;
      }
      case "import": {
        const noSpend = Array.isArray(o.noSpend) ? o.noSpend.slice(0, ACTIVITY_WINDOW_DAYS + 2).filter(isInt) : [];
        out.push({
          id,
          t: "import",
          noSpend: [...new Set(noSpend)].sort((a, b) => a - b),
          limits: parseLimitList(o.limits),
          letter: parseLetterKey(o.letter),
          seen: parseSeen(o.seen),
          tour: parseTour(o.tour)
        });
        break;
      }
      default:
      // tipe tak dikenal (termasuk "toggle"): dibuang
    }
  }
  return out;
}

const tourUnconditional = (op: Extract<SyncOp, { t: "tour" }>) => op.restart || op.status !== "active";
const sameTour = (a: StoredTour | null, b: StoredTour | null) => a?.status === b?.status && a?.step === b?.step;

/**
 * Batas dari impor yang boleh ditambahkan: hanya tempat yang belum punya batas (yang sudah ada di
 * server menang), sisanya sampai MAX_PLACE_LIMITS, yang paling akhir disimpan didahulukan.
 */
export function importableLimits(existingKeys: ReadonlySet<string>, limits: readonly PlaceLimit[]): PlaceLimit[] {
  const room = MAX_PLACE_LIMITS - existingKeys.size;
  if (room <= 0) return [];
  const byKey = new Map<string, PlaceLimit>();
  for (const l of limits) {
    const key = normalizePlaceName(l.name);
    if (!key || existingKeys.has(key)) continue;
    byKey.delete(key); // duplikat: yang terakhir menang
    byKey.set(key, l);
  }
  return [...byKey.values()].slice(-room);
}

/** Satu op diterapkan ke data. Mengembalikan objek yang SAMA kalau tidak ada perubahan. */
export function applySyncOp(s: VillageSyncData, op: SyncOp, today: number): VillageSyncData {
  switch (op.t) {
    case "nospend": {
      const has = s.noSpend.includes(op.day);
      if (op.on) {
        if (has || !noSpendAllowed(op.day, today)) return s;
        return { ...s, noSpend: [...s.noSpend, op.day].sort((a, b) => a - b) };
      }
      return has ? { ...s, noSpend: s.noSpend.filter((d) => d !== op.day) } : s;
    }
    case "limit": {
      const name = cleanPlaceName(op.name);
      const key = normalizePlaceName(name);
      if (!key) return s;
      if (op.limit !== null) {
        if (!validLimitValue(op.limit)) return s;
        // Tempat baru saat sudah penuh ditolak; yang lama tidak pernah digusur.
        if (!(key in s.placeLimits) && Object.keys(s.placeLimits).length >= MAX_PLACE_LIMITS) return s;
      }
      const next = withPlaceLimit(s.placeLimits, name, op.limit);
      return next === s.placeLimits ? s : { ...s, placeLimits: next };
    }
    case "letter":
      return s.letter === op.key || !parseLetterKey(op.key) ? s : { ...s, letter: op.key };
    case "seen": {
      const next = s.seen
        ? { villagers: Math.max(s.seen.villagers, op.villagers), level: Math.max(s.seen.level, op.level) }
        : { villagers: op.villagers, level: op.level };
      return s.seen && s.seen.villagers === next.villagers && s.seen.level === next.level ? s : { ...s, seen: next };
    }
    case "mail":
      return s.mail !== null && s.mail >= op.occ ? s : { ...s, mail: op.occ };
    case "tour": {
      if (!tourUnconditional(op) && isTerminalTour(s.tour)) return s;
      const next: StoredTour = { status: op.status, step: clampTourStep(op.step) };
      return sameTour(s.tour, next) ? s : { ...s, tour: next };
    }
    case "import":
      return mergeImport(s, op, today);
  }
}

/**
 * Impor data lama satu perangkat. Hari nol pengeluaran digabung (tanpa batas mundur, ini tanda
 * lama yang sah), batas: yang sudah ada menang, surat: hanya kalau belum ada, perayaan: maksimum,
 * tur: selesai/dilewati mengalahkan "active", "active" hanya kalau belum ada.
 */
function mergeImport(s: VillageSyncData, op: Extract<SyncOp, { t: "import" }>, today: number): VillageSyncData {
  let next = s;
  const days = op.noSpend.filter((d) => d > today - ACTIVITY_WINDOW_DAYS && d <= today && !s.noSpend.includes(d));
  if (days.length) next = { ...next, noSpend: [...new Set([...s.noSpend, ...days])].sort((a, b) => a - b) };

  const add = importableLimits(new Set(Object.keys(s.placeLimits)), op.limits);
  if (add.length) {
    let limits = next.placeLimits;
    for (const l of add) limits = withPlaceLimit(limits, l.name, l.limit);
    if (limits !== next.placeLimits) next = { ...next, placeLimits: limits };
  }

  if (!next.letter && op.letter) next = { ...next, letter: op.letter };
  if (op.seen) next = applySyncOp(next, { id: op.id, t: "seen", ...op.seen }, today);
  if (op.tour) {
    const keep = isTerminalTour(op.tour) ? isTerminalTour(next.tour) : next.tour !== null;
    if (!keep && !sameTour(next.tour, op.tour)) next = { ...next, tour: { ...op.tour } };
  }
  return next;
}

export function applySyncOps(s: VillageSyncData, ops: readonly SyncOp[], today: number): VillageSyncData {
  return ops.reduce((acc, op) => applySyncOp(acc, op, today), s);
}

/** Tampilan di browser = versi server terakhir + op yang belum dikonfirmasi (persis yang nanti dihitung server). */
export function deriveView(base: VillageSyncData, outbox: readonly SyncOp[], today: number): VillageSyncData {
  return applySyncOps(dataOf(base), outbox, today);
}

export const dataOf = (s: VillageSyncData): VillageSyncData => ({
  noSpend: s.noSpend,
  placeLimits: s.placeLimits,
  letter: s.letter,
  seen: s.seen,
  tour: s.tour,
  mail: s.mail
});

/** Dari dua salinan server, yang dibaca lebih belakangan (seri: yang datang). */
export function newerSync(a: VillageSync | null | undefined, b: VillageSync | null | undefined): VillageSync {
  if (!a) return b ?? LOCAL_SYNC;
  if (!b) return a;
  return b.at >= a.at ? b : a;
}

// ── Outbox ───────────────────────────────────────────────────────────────────
const opKey = (op: Exclude<SyncOp, { t: "import" }>) => {
  switch (op.t) {
    case "nospend":
      return `n${op.day}`;
    case "limit":
      return `p${normalizePlaceName(op.name)}`;
    case "letter":
      return "l";
    case "seen":
      return "s";
    case "mail":
      return "m";
    case "tour":
      return "t";
  }
};

/** Dua op berurutan untuk kunci yang sama → satu op dengan hasil yang sama. id = milik op terbaru. */
function fold(prev: Exclude<SyncOp, { t: "import" }>, op: Exclude<SyncOp, { t: "import" }>): SyncOp {
  if (op.t === "mail" && prev.t === "mail") return { ...op, occ: Math.max(prev.occ, op.occ) };
  if (op.t === "seen" && prev.t === "seen") {
    return { ...op, villagers: Math.max(prev.villagers, op.villagers), level: Math.max(prev.level, op.level) };
  }
  if (op.t === "tour" && prev.t === "tour" && !tourUnconditional(op) && tourUnconditional(prev)) {
    // "active" biasa setelah status pasti: hasilnya pasti, jadi op gabungannya tanpa syarat.
    return isTerminalTour(prev) ? { ...prev, id: op.id } : { ...op, restart: true };
  }
  return op;
}

/**
 * Ringkas outbox: satu op per kunci (hari, tempat, surat, perayaan, tur, Pak Pos) di posisi kemunculan
 * terakhirnya. Op impor jadi pembatas (tidak digabung, op tidak dipindah melewatinya). id op
 * gabungan selalu id op terbaru, jadi op yang sedang terkirim dari tab lain tidak ikut terhapus
 * saat tab itu menerima konfirmasi.
 */
export function compactOutbox(ops: readonly SyncOp[]): SyncOp[] {
  const out: SyncOp[] = [];
  let segment = new Map<string, { op: SyncOp; pos: number }>();
  let pos = 0;
  const flushSegment = () => {
    out.push(...[...segment.values()].sort((a, b) => a.pos - b.pos).map((e) => e.op));
    segment = new Map();
  };
  for (const op of ops) {
    if (op.t === "import") {
      flushSegment();
      out.push(op);
      continue;
    }
    const key = opKey(op);
    const prev = segment.get(key)?.op as Exclude<SyncOp, { t: "import" }> | undefined;
    segment.set(key, { op: prev ? fold(prev, op) : op, pos: pos++ });
  }
  flushSegment();
  return out;
}

// ── Perbandingan (hindari render ulang kalau isinya sama) ────────────────────
export function sameNumberList(a: readonly number[], b: readonly number[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Urutan kunci diabaikan (JSONB & baris database tidak menjaga urutan). */
export function samePlaceLimits(a: PlaceLimits, b: PlaceLimits) {
  if (a === b) return true;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => b[k] !== undefined && b[k].name === a[k].name && b[k].limit === a[k].limit);
}

export const sameSeen = (a: Seen | null, b: Seen | null) =>
  a === b || (a !== null && b !== null && a.villagers === b.villagers && a.level === b.level);

export const sameStoredTour = (a: StoredTour | null, b: StoredTour | null) =>
  a === b || (a !== null && b !== null && sameTour(a, b));

// ── Impor sekali dari kunci localStorage v1 ──────────────────────────────────
/** Isi mentah (getItem) kunci v1 per user, sebelum data desa pindah ke database. */
export interface LegacyRaw {
  /** tepira-village-nospend:v1:<email> → number[] */
  nospend: string | null;
  /** tepira-village-seen:v1:<email> → { villagers, level } */
  seen: string | null;
  /** tepira-village-letter:v1:<email> → "i12" */
  letter: string | null;
  /** tepira-village-placelimits:v1:<email> → { [kunci]: { name, limit } } */
  limits: string | null;
  /** tepira-village-tour:v1:<email> → { status, step } */
  tour: string | null;
}

/** null kalau semua kunci kosong; selain itu hash isi (berubah kalau tab lama menulis lagi). */
export function legacyFingerprint(raw: LegacyRaw): string | null {
  const parts = [raw.nospend, raw.seen, raw.letter, raw.limits, raw.tour];
  if (parts.every((p) => p === null)) return null;
  const text = JSON.stringify(parts);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${h.toString(36)}.${text.length.toString(36)}`;
}

const parseJson = (raw: string | null): unknown => {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** Op impor dari isi kunci v1 (validator sama dengan kode lama); null kalau tidak ada yang bisa diimpor. */
export function importFromLegacy(raw: LegacyRaw, id: string, today: number): SyncOp | null {
  const nospend = parseJson(raw.nospend);
  const noSpend = Array.isArray(nospend)
    ? [...new Set(nospend.filter((d): d is number => isInt(d) && d > today - ACTIVITY_WINDOW_DAYS && d <= today))].sort(
        (a, b) => a - b
      )
    : [];
  const limits = parseLimitList(Object.values(parsePlaceLimits(parseJson(raw.limits))));
  const letter = parseLetterKey(parseJson(raw.letter));
  const seen = parseSeen(parseJson(raw.seen));
  const tour = parseTour(parseJson(raw.tour));
  if (!noSpend.length && !limits.length && !letter && !seen && !tour) return null;
  return { id, t: "import", noSpend, limits, letter, seen, tour };
}
