import { expenseCategories, type ExpenseCategoryKey } from "@/lib/categories";
import { wibDay, type ExpenseView, type KnownPlace } from "@/lib/game";

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
  /** jumlah catatan */
  count: number;
  /** jumlah hari (WIB) berbeda ke sini: dua struk di hari yang sama = satu kunjungan */
  visits: number;
  /** label kategori dengan nominal terbesar di tempat ini */
  topCategory: string | null;
}

/** Kunci satu tempat: nama yang dinormalkan, atau titiknya (±11 m) kalau tanpa nama. */
const placeKey = (e: Pick<ExpenseView, "placeName">, lat: number, lng: number) =>
  e.placeName ? `n:${normalizePlaceName(e.placeName)}` : `p:${lat.toFixed(4)},${lng.toFixed(4)}`;

/**
 * Kelompokkan pengeluaran berlokasi per tempat: nama yang sama jadi satu (titiknya ikut yang terbaru),
 * yang tanpa nama dikelompokkan per titik (±11 m). Urut dari nominal terbesar.
 */
export function spendingByPlace(expenses: readonly ExpenseView[]): PlaceSpend[] {
  const groups = new Map<
    string,
    Omit<PlaceSpend, "visits"> & { latest: string; byCategory: Map<string, number>; days: Set<number> }
  >();
  for (const e of expenses) {
    if (e.latitude === null || e.longitude === null) continue;
    const key = placeKey(e, e.latitude, e.longitude);
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
        byCategory: new Map(),
        days: new Set()
      };
      groups.set(key, g);
    }
    g.total += e.amount;
    g.count++;
    g.days.add(wibDay(e.date));
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
      visits: g.days.size,
      topCategory: [...g.byCategory.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    }))
    .sort((a, b) => b.total - a.total);
}

/** Kunci tempat bernama di peta (sama dengan placeKey untuk catatan yang punya nama). */
export const spotKeyFor = (name: string) => `n:${normalizePlaceName(name)}`;

export interface PlaceMonthSpend {
  /** normalizePlaceName(nama) */
  key: string;
  /** ejaan dari catatan terbaru */
  name: string;
  total: number;
  count: number;
  /** hari WIB berbeda */
  visits: number;
  topCategory: string | null;
}

/**
 * Belanja per nama tempat (semua kategori), dasar batas jajan dan kios. Berbeda dengan
 * spendingByPlace, catatan yang punya nama tapi tanpa titik ikut dihitung; yang tanpa nama dilewati.
 */
export function spendByPlaceName(expenses: readonly ExpenseView[]): Map<string, PlaceMonthSpend> {
  const groups = new Map<
    string,
    Omit<PlaceMonthSpend, "visits" | "topCategory"> & { latest: string; days: Set<number>; byCategory: Map<string, number> }
  >();
  for (const e of expenses) {
    const name = e.placeName?.trim().replace(/\s+/g, " ");
    if (!name) continue;
    const key = normalizePlaceName(name);
    let g = groups.get(key);
    if (!g) {
      g = { key, name, total: 0, count: 0, latest: e.date, days: new Set(), byCategory: new Map() };
      groups.set(key, g);
    }
    g.total += e.amount;
    g.count++;
    g.days.add(wibDay(e.date));
    const category = e.category || "Lainnya";
    g.byCategory.set(category, (g.byCategory.get(category) ?? 0) + e.amount);
    if (e.date > g.latest) {
      g.latest = e.date;
      g.name = name;
    }
  }
  const out = new Map<string, PlaceMonthSpend>();
  for (const g of groups.values()) {
    out.set(g.key, {
      key: g.key,
      name: g.name,
      total: g.total,
      count: g.count,
      visits: g.days.size,
      topCategory: [...g.byCategory.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    });
  }
  return out;
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

/** Ikon penanda di peta per kategori. */
const CATEGORY_ICONS: Record<ExpenseCategoryKey, string> = {
  makan_harian: "🍜",
  transport: "🛵",
  pulsa_internet: "📶",
  listrik_kos: "💡",
  langganan: "🎧",
  kesehatan: "💊",
  sosial: "🤝",
  nongkrong: "☕",
  belanja_kecil: "🛍️"
};

export function categoryIcon(label: string | null) {
  const c = expenseCategories.find((x) => x.label === label);
  return c ? CATEGORY_ICONS[c.key] : "📍";
}

/** "Langganan (Spotify, Netflix, dll)" → "Langganan" */
export const shortCategory = (label: string) => label.replace(/\s*\(.*\)$/, "");

const TRAVEL_LABEL = expenseCategories.find((c) => c.key === "transport")!.label;

export interface JajanSummary {
  /** tempat sesuai filter kategori, urut nominal terbesar */
  spots: PlaceSpend[];
  locatedTotal: number;
  /** total semua pengeluaran bulan ini (untuk persentase yang punya lokasi) */
  monthTotal: number;
  /** chip kategori: berapa tempat yang punya pengeluaran kategori itu, urut terbanyak */
  categories: { label: string; places: number }[];
  /** transport tanpa lokasi (ojek, taksi, bensin di jalan) */
  travel: { count: number; total: number };
  /** selain transport, tanpa lokasi (tagihan, belanja online, …) */
  unplaced: { count: number; total: number; categories: string[] };
  /** tempat yang didatangi lebih dari sekali (di hari berbeda), urut paling sering */
  regulars: PlaceSpend[];
  /** tempat bernama yang belum pernah dicatat setahun sebelum bulan ini */
  firstVisits: PlaceSpend[];
}

/**
 * Ringkasan peta jajan untuk satu bulan ala "Peta Oyen": total & jumlah tempat, chip kategori,
 * perjalanan/tanpa tempat, tempat langganan, dan tempat yang pertama kali didatangi.
 * `placesBefore` = nama tempat (dinormalkan) yang tercatat sebelum bulan ini.
 */
export function jajanSummary(
  expenses: readonly ExpenseView[],
  placesBefore: readonly string[],
  category: string | null = null
): JajanSummary {
  const located: ExpenseView[] = [];
  const travel = { count: 0, total: 0 };
  const unplaced = { count: 0, total: 0, categories: [] as string[] };
  const unplacedByCategory = new Map<string, number>();
  let monthTotal = 0;
  for (const e of expenses) {
    monthTotal += e.amount;
    if (e.latitude !== null && e.longitude !== null) located.push(e);
    else if (e.category === TRAVEL_LABEL) {
      travel.count++;
      travel.total += e.amount;
    } else {
      unplaced.count++;
      unplaced.total += e.amount;
      const c = shortCategory(e.category || "Lainnya");
      unplacedByCategory.set(c, (unplacedByCategory.get(c) ?? 0) + e.amount);
    }
  }
  unplaced.categories = [...unplacedByCategory.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);

  const byCategory = new Map<string, Set<string>>();
  for (const e of located) {
    const c = e.category || "Lainnya";
    if (!byCategory.has(c)) byCategory.set(c, new Set());
    byCategory.get(c)!.add(placeKey(e, e.latitude!, e.longitude!));
  }
  const categories = [...byCategory.entries()]
    .map(([label, keys]) => ({ label, places: keys.size }))
    .sort((a, b) => b.places - a.places || a.label.localeCompare(b.label));

  const filtered = category ? located.filter((e) => (e.category || "Lainnya") === category) : located;
  const spots = spendingByPlace(filtered);
  const seen = new Set(placesBefore);
  return {
    spots,
    locatedTotal: filtered.reduce((s, e) => s + e.amount, 0),
    monthTotal,
    categories,
    travel,
    unplaced,
    regulars: spots.filter((s) => s.visits > 1).sort((a, b) => b.visits - a.visits || b.total - a.total),
    firstVisits: spots.filter((s) => s.name !== null && !seen.has(normalizePlaceName(s.name)))
  };
}

/** Cocokkan ketikan pencarian dengan nama tempat atau kategorinya. */
export function spotMatches(spot: PlaceSpend, query: string) {
  const q = normalizePlaceName(query);
  if (!q) return true;
  return normalizePlaceName(`${spot.name ?? "titik tanpa nama"} ${spot.topCategory ?? ""}`).includes(q);
}

/**
 * Gabungkan titik layar yang berdekatan jadi satu penanda (rakus: yang bobotnya terbesar jadi
 * pusat, lalu menyerap tetangga dalam `radius` px). Hasilnya indeks per kelompok, pusat di depan.
 */
export function groupNearby(points: readonly { x: number; y: number }[], weights: readonly number[], radius: number) {
  const order = points.map((_, i) => i).sort((a, b) => weights[b] - weights[a] || a - b);
  const taken = new Array<boolean>(points.length).fill(false);
  const groups: number[][] = [];
  for (const i of order) {
    if (taken[i]) continue;
    taken[i] = true;
    const group = [i];
    for (const j of order) {
      if (taken[j]) continue;
      if (Math.hypot(points[j].x - points[i].x, points[j].y - points[i].y) <= radius) {
        taken[j] = true;
        group.push(j);
      }
    }
    groups.push(group);
  }
  return groups;
}
