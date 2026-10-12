import { normalizePlaceName } from "@/lib/places";

/**
 * Batas jajan per tempat ("Kopi Toko Djawa maks. Rp150 rb/bulan"). Disimpan per user di browser
 * (components/village/daily.ts), jadi semua yang masuk dari storage dibersihkan lewat parsePlaceLimits.
 */

export type LimitLevel = "ok" | "warn" | "over";

export interface PlaceLimit {
  /** nama seperti ditulis user (untuk tampilan) */
  name: string;
  /** rupiah bulat per bulan kalender */
  limit: number;
}

/** Kunci = normalizePlaceName(nama). */
export type PlaceLimits = Readonly<Record<string, PlaceLimit>>;

export const NO_LIMITS: PlaceLimits = Object.freeze({});
/** Sama dengan batas nominal di server (MAX_AMOUNT di app/village/actions.ts, tidak bisa diimpor dari "use server"). */
export const MAX_LIMIT = 2_147_483_647;
export const MAX_PLACE_LIMITS = 50;
/** Mulai 80% dianggap hampir batas. */
export const LIMIT_WARN_RATIO = 0.8;

export const LIMIT_WORD: Record<LimitLevel, string> = { ok: "aman", warn: "hampir batas", over: "lewat batas" };
export const LIMIT_EMOJI: Record<LimitLevel, string> = { ok: "🎯", warn: "⚠️", over: "🥀" };
/** Sama dengan warna pemakaian jatah di panel gaji. */
export const LIMIT_COLOR: Record<LimitLevel, string> = { ok: "#6cc8ad", warn: "#e0b84a", over: "#e86d6d" };
export const LIMIT_RANK: Record<LimitLevel, number> = { ok: 0, warn: 1, over: 2 };

const validLimit = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= MAX_LIMIT;

/** Bersihkan isi storage: kunci dinormalkan ulang, entri rusak dibuang, maksimal MAX_PLACE_LIMITS. */
export function parsePlaceLimits(v: unknown): PlaceLimits {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, PlaceLimit> = {};
  for (const [key, entry] of Object.entries(v as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Partial<PlaceLimit>;
    const name = (typeof e.name === "string" ? e.name : key).trim().replace(/\s+/g, " ");
    const norm = normalizePlaceName(name);
    if (!norm || !validLimit(e.limit)) continue;
    delete out[norm]; // duplikat: yang terakhir menang dan pindah ke belakang
    out[norm] = { name, limit: Math.round(e.limit) };
  }
  const keys = Object.keys(out);
  return keys.length > MAX_PLACE_LIMITS ? Object.fromEntries(keys.slice(-MAX_PLACE_LIMITS).map((k) => [k, out[k]])) : out;
}

/** Pasang/ganti/hapus satu batas. null atau ≤0 = hapus. Mengembalikan objek yang sama kalau tidak ada perubahan. */
export function withPlaceLimit(limits: PlaceLimits, name: string, limit: number | null): PlaceLimits {
  const clean = name.trim().replace(/\s+/g, " ");
  const norm = normalizePlaceName(clean);
  if (!norm) return limits;
  if (limit === null || !(limit > 0)) {
    if (!(norm in limits)) return limits;
    const next = { ...limits };
    delete next[norm];
    return next;
  }
  if (!validLimit(limit)) return limits;
  const rounded = Math.round(limit);
  const cur = limits[norm];
  if (cur && cur.limit === rounded && cur.name === clean) return limits;
  return { ...limits, [norm]: { name: clean, limit: rounded } };
}

export function findPlaceLimit(limits: PlaceLimits, name: string | null | undefined): PlaceLimit | null {
  if (!name) return null;
  return limits[normalizePlaceName(name)] ?? null;
}

export interface LimitStatus {
  level: LimitLevel;
  /** spent / limit */
  ratio: number;
  /** sisa sebelum lewat; negatif = sudah lewat sebanyak itu */
  remaining: number;
}

/** "over" kalau melewati batas (sama persis dengan batas masih "warn"), "warn" mulai 80%. */
export function limitStatus(spent: number, limit: number): LimitStatus | null {
  if (!(limit > 0) || !Number.isFinite(spent)) return null;
  const ratio = spent / limit;
  const level: LimitLevel = spent > limit ? "over" : ratio >= LIMIT_WARN_RATIO ? "warn" : "ok";
  return { level, ratio, remaining: limit - spent };
}
