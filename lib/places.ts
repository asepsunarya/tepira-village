import { expenseCategories, type ExpenseCategoryKey } from "@/lib/categories";
import type { ExpenseView, KnownPlace } from "@/lib/game";

/** Aturan "peta jajan" yang dipakai bersama server, panel peta, dan catat cepat. */

export const normalizePlaceName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** Huruf besar di awal tiap kata: "warung pak kumis" → "Warung Pak Kumis". */
export const titleCase = (s: string) => s.replace(/(^|\s)(\p{L})/gu, (_m, space: string, ch: string) => space + ch.toUpperCase());

/** Koordinat dibulatkan ke 5 desimal (±1 m): cukup untuk membedakan toko, tidak berlebihan. */
export const roundCoord = (v: number) => Math.round(v * 1e5) / 1e5;

/**
 * Cocokkan nama yang diketik dengan tempat yang pernah dicatat: yang sama persis dulu, lalu yang
 * namanya memuat ketikan itu (minimal 3 huruf) dan paling sering dipakai. "kumis" → "Bakso Pak Kumis".
 */
export function matchKnownPlace(query: string, places: readonly KnownPlace[]): KnownPlace | null {
  const q = normalizePlaceName(query);
  if (!q) return null;
  const exact = places.find((p) => normalizePlaceName(p.name) === q);
  if (exact) return exact;
  if (q.length < 3) return null;
  let best: KnownPlace | null = null;
  for (const p of places) {
    if (normalizePlaceName(p.name).includes(q) && (!best || p.count > best.count)) best = p;
  }
  return best;
}

/**
 * Ringkas tempat dari pengeluaran berlokasi (server): nama unik, titik terbaru, jumlah pakai.
 * `rows` harus urut dari yang terbaru.
 */
export function knownPlacesFrom(
  rows: readonly { placeName: string | null; latitude: number | null; longitude: number | null }[],
  limit = 30
): KnownPlace[] {
  const byName = new Map<string, KnownPlace & { order: number }>();
  for (const r of rows) {
    if (!r.placeName || r.latitude === null || r.longitude === null) continue;
    const key = normalizePlaceName(r.placeName);
    const known = byName.get(key);
    if (known) known.count++;
    else byName.set(key, { name: r.placeName.trim(), lat: r.latitude, lng: r.longitude, count: 1, order: byName.size });
  }
  return [...byName.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, limit)
    .map(({ name, lat, lng, count }) => ({ name, lat, lng, count }));
}

export interface PlaceSpend {
  key: string;
  /** null = titik tanpa nama */
  name: string | null;
  lat: number;
  lng: number;
  total: number;
  count: number;
  /** label kategori dengan nominal terbesar di tempat ini */
  topCategory: string | null;
}

/**
 * Kelompokkan pengeluaran berlokasi per tempat: nama yang sama jadi satu (titiknya ikut yang terbaru),
 * yang tanpa nama dikelompokkan per titik (±11 m). Urut dari nominal terbesar.
 */
export function spendingByPlace(expenses: readonly ExpenseView[]): PlaceSpend[] {
  const groups = new Map<string, PlaceSpend & { latest: string; byCategory: Map<string, number> }>();
  for (const e of expenses) {
    if (e.latitude === null || e.longitude === null) continue;
    const key = e.placeName
      ? `n:${normalizePlaceName(e.placeName)}`
      : `p:${e.latitude.toFixed(4)},${e.longitude.toFixed(4)}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        name: e.placeName?.trim() || null,
        lat: e.latitude,
        lng: e.longitude,
        total: 0,
        count: 0,
        topCategory: null,
        latest: e.date,
        byCategory: new Map()
      };
      groups.set(key, g);
    }
    g.total += e.amount;
    g.count++;
    const category = e.category || "Lainnya";
    g.byCategory.set(category, (g.byCategory.get(category) ?? 0) + e.amount);
    if (e.date > g.latest) {
      g.latest = e.date;
      g.lat = e.latitude;
      g.lng = e.longitude;
    }
  }
  return [...groups.values()]
    .map((g) => ({
      key: g.key,
      name: g.name,
      lat: g.lat,
      lng: g.lng,
      total: g.total,
      count: g.count,
      topCategory: [...g.byCategory.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    }))
    .sort((a, b) => b.total - a.total);
}

/** Warna titik di peta per kategori tepira (senada dengan palet desa). */
const CATEGORY_COLORS: Record<ExpenseCategoryKey, string> = {
  makan_harian: "#f0a06a",
  transport: "#5b9ae0",
  pulsa_internet: "#b391f0",
  listrik_kos: "#e0b84a",
  langganan: "#f28cb4",
  kesehatan: "#2fb57d",
  sosial: "#ff7e9e",
  nongkrong: "#a97a52",
  belanja_kecil: "#6cc8ad"
};

export function categoryColor(label: string | null) {
  const c = expenseCategories.find((x) => x.label === label);
  return c ? CATEGORY_COLORS[c.key] : "#9a8aa0";
}
