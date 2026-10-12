import { expenseCategories, type ExpenseCategoryKey } from "@/lib/categories";
import type { KnownPlace } from "@/lib/game";
import { matchKnownPlace, titleCase } from "@/lib/places";

/**
 * "Catat cepat": satu kalimat bebas → isian form pengeluaran, dibaca di browser setiap ketikan.
 *   "bakso 15rb gopay"             → Rp15.000 · Makan harian · dompet GoPay
 *   "kemarin parkir 2rb"           → Rp2.000 · Transport · tanggal kemarin
 *   "spotify 54.900 kartu kredit"  → Rp54.900 · Langganan · dompet kartu kredit
 *   "kopi 20rb @toko djawa"        → … · tempat "Toko Djawa" (titiknya ikut kalau pernah dicatat)
 * Hanya aturan dan kata kunci (tanpa AI). Bagian yang tidak terbaca dikembalikan null supaya form
 * memakai isiannya sendiri.
 */

export interface QuickWallet {
  id: number;
  name: string;
  type: string;
}

export interface QuickEntry {
  amount: number | null;
  /** angka tanpa satuan di bawah 1.000 dibaca ribuan: "bakso 15" = Rp15.000 */
  assumedThousands: boolean;
  categoryKey: ExpenseCategoryKey | null;
  walletId: number | null;
  /** 0 = hari ini, 1 = kemarin, …; null = tanggal tidak disebut */
  daysAgo: number | null;
  /** "bonus" kalau ditulis "dari bonus" / "pakai bonus"; null = tidak disebut */
  source: "bonus" | null;
  /** "@nama tempat"; titiknya terisi kalau cocok dengan tempat yang pernah dicatat */
  place: { name: string; lat: number | null; lng: number | null } | null;
  /** sisa kalimat untuk catatan, mis. "Bakso" */
  note: string;
}

// Frasa utuh = tidak menempel ke huruf/angka di kiri-kanannya. Batas kiri ditangkap sebagai grup,
// bukan lookbehind, supaya regex tetap jalan di Safari iOS lama.
const NOT_WORD = "[^\\p{L}\\d]";
const wordRegex = (pattern: string, flags = "u") => new RegExp(`(^|${NOT_WORD})(${pattern})(?![\\p{L}\\d])`, flags);
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Hit {
  start: number;
  end: number;
  groups: string[];
}

function toHit(m: RegExpExecArray): Hit {
  const start = m.index + m[1].length;
  return { start, end: start + m[2].length, groups: m.slice(3) };
}

function find(text: string, re: RegExp): Hit | null {
  const m = re.exec(text);
  return m ? toHit(m) : null;
}

/** Ganti bagian yang sudah terbaca dengan spasi supaya tidak ikut dibaca aturan berikutnya. */
const blank = (text: string, hit: Hit) => `${text.slice(0, hit.start)} ${text.slice(hit.end)}`;

// ── Sumber dana ──────────────────────────────────────────────────────────────
const BONUS = wordRegex("(?:dari|pakai|pake|pk|uang|via)\\s+bonus");

// ── Tanggal ──────────────────────────────────────────────────────────────────
function daysSinceDayOfMonth(day: number, today: Date) {
  if (day < 1 || day > 31) return null;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Tanggal yang belum lewat bulan ini berarti bulan lalu.
  const d = new Date(t.getFullYear(), t.getMonth() - (day > t.getDate() ? 1 : 0), day);
  if (d.getDate() !== day) return null; // mis. "tgl 31" di bulan 30 hari
  return Math.round((t.getTime() - d.getTime()) / 86_400_000);
}

/** Satu tanggal per kalimat; aturan yang lebih khusus dicek lebih dulu. */
const DATE_RULES: { re: RegExp; days: (groups: string[], today: Date) => number | null }[] = [
  { re: wordRegex("(?:kemarin|kemaren|kmrn|kmarin)\\s+lusa"), days: () => 2 },
  { re: wordRegex("(\\d{1,2})\\s*(?:hari|hr)\\s+(?:yang\\s+|yg\\s+)?lalu"), days: ([n]) => Number(n) },
  { re: wordRegex("(?:tgl|tanggal)\\.?\\s*(\\d{1,2})"), days: ([n], today) => daysSinceDayOfMonth(Number(n), today) },
  { re: wordRegex("kemarin|kemaren|kmrn|kmarin|semalam"), days: () => 1 },
  { re: wordRegex("hari\\s+ini|barusan|tadi(?:\\s+(?:pagi|siang|sore|malam))?"), days: () => 0 }
];

// ── Dompet ───────────────────────────────────────────────────────────────────
/** Sebutan umum per jenis dompet; menunjuk dompet pertama dengan jenis itu. */
const TYPE_ALIASES: Record<string, string[]> = {
  cash: ["uang tunai", "duit tunai", "tunai", "cash", "kontan"],
  "e-wallet": ["dompet digital", "e-wallet", "ewallet"],
  credit: ["kartu kredit", "credit card", "kk", "cc"],
  paylater: ["paylater", "pay later"],
  bank: ["transfer", "debit"]
};

/** Kata di nama dompet yang terlalu umum untuk dicocokkan sendirian ("Rekening utama"). */
const NAME_STOPWORDS = new Set(["dompet", "rekening", "rek", "utama", "tabungan", "kartu", "akun", "saldo", "uang", "bank", "pribadi", "harian"]);

/** "bayar pakai gopay" / "via bca": kata penghubungnya ikut dibuang dari catatan. */
const CONNECTOR = "(?:(?:bayar|byr)\\s+)?(?:(?:pakai|pake|pakek|pk|via|lewat|dari|dgn|dengan)\\s+)?";

const walletMatcherCache = new WeakMap<readonly QuickWallet[], { id: number; re: RegExp }[]>();

function walletMatchers(wallets: readonly QuickWallet[]) {
  const cached = walletMatcherCache.get(wallets);
  if (cached) return cached;
  // rank: 0 = nama lengkap, 1 = kata khas di nama, 2 = sebutan jenis.
  const aliases: { id: number; alias: string; rank: number }[] = [];
  const add = (id: number, alias: string, rank: number) => {
    const a = alias.trim().toLowerCase();
    if (a.length >= 2) aliases.push({ id, alias: a, rank });
  };
  for (const w of wallets) {
    add(w.id, w.name, 0);
    // Suara menulis "GoPay" sebagai "go pay", "ShopeePay" → "shopee pay".
    const spaced = w.name.replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2");
    if (spaced !== w.name) add(w.id, spaced, 0);
    for (const token of w.name.toLowerCase().split(/[^\p{L}\d]+/u)) {
      if (token.length >= 3 && !NAME_STOPWORDS.has(token)) add(w.id, token, 1);
    }
  }
  for (const [type, list] of Object.entries(TYPE_ALIASES)) {
    const w = wallets.find((x) => x.type === type);
    if (w) for (const a of list) add(w.id, a, 2);
  }
  // Yang terpanjang dulu ("kartu kredit bca" menang atas "bca"); sama panjang → nama lengkap dulu, jadi
  // "bca" menunjuk dompet "BCA", bukan "Kartu kredit BCA". Sisanya ikut urutan dompet (sort stabil).
  const matchers = aliases
    .sort((a, b) => b.alias.length - a.alias.length || a.rank - b.rank)
    .map(({ id, alias }) => ({ id, re: wordRegex(`${CONNECTOR}${escapeRegExp(alias).replace(/\s+/g, "\\s+")}`) }));
  walletMatcherCache.set(wallets, matchers);
  return matchers;
}

// ── Nominal ──────────────────────────────────────────────────────────────────
const UNIT: Record<string, number> = { rb: 1e3, ribu: 1e3, rbu: 1e3, rebu: 1e3, k: 1e3, jt: 1e6, juta: 1e6, perak: 1 };

// grup: 3 = awalan "rp", 4 = angka, 5 = satuan, 6 = akhiran "rupiah". "2x" / "im3" tidak terbaca sebagai nominal.
const AMOUNT = new RegExp(
  `(^|${NOT_WORD})((rp\\.?\\s*)?(\\d+(?:[.,]\\d+)*)(?:\\s*(rb|ribu|rbu|rebu|k|jt|juta|perak)(?!\\p{L}))?(?:\\s*(rupiah)(?!\\p{L}))?)(?![\\p{L}\\d])`,
  "gu"
);

/** "15.000" / "54,900" = pemisah ribuan; "1,5jt" / "2.5rb" = desimal (hanya kalau ada satuan). */
function toNumber(raw: string, decimalAllowed: boolean) {
  const parts = raw.split(/[.,]/);
  if (parts.length === 1) return Number(raw);
  const last = parts[parts.length - 1];
  if (decimalAllowed && parts.length === 2 && last.length <= 2) return Number(`${parts[0]}.${last}`);
  if (parts.slice(1).every((p) => p.length === 3)) return Number(parts.join(""));
  if (parts.length === 2) return Number(`${parts[0]}.${last}`);
  return Number.NaN;
}

/** `nameSpan`: bagian "@nama tempat"; angka tanpa satuan di situ bagian dari nama ("24 jam"). */
function findAmount(text: string, nameSpan: { start: number; end: number } | null) {
  let explicit: (Hit & { value: number }) | null = null;
  let bare: (Hit & { value: number; assumed: boolean }) | null = null;
  AMOUNT.lastIndex = 0;
  for (let m = AMOUNT.exec(text); m; m = AMOUNT.exec(text)) {
    const [, , , rp, digits, unit, rupiah] = m;
    // "Rp15.000" dan "500 rupiah" sama-sama nominal yang jelas (tidak "dianggap ribuan").
    const prefix = rp || rupiah;
    const start = m.index + m[1].length;
    if (!unit && !prefix && nameSpan && start >= nameSpan.start && start < nameSpan.end) continue;
    const n = toNumber(digits, Boolean(unit) && unit !== "perak");
    if (!Number.isFinite(n)) continue;
    let value = unit ? n * UNIT[unit] : n;
    const assumed = !unit && !prefix && value < 1000;
    if (assumed) value *= 1000;
    value = Math.round(value);
    if (value <= 0) continue;
    if (unit || prefix) {
      // Yang bersatuan ("15rb", "Rp15.000") paling jelas: pakai yang pertama.
      explicit ??= { ...toHit(m), value };
    } else if (!bare || value > bare.value) {
      // Tanpa satuan: ambil yang terbesar ("2 porsi 30000" → 30000).
      bare = { ...toHit(m), value, assumed };
    }
  }
  if (explicit) return { ...explicit, assumed: false };
  return bare;
}

// ── Kategori ─────────────────────────────────────────────────────────────────
// Kata kunci per kategori tepira. Frasa yang lebih panjang dicek dulu dan "dipakai habis", jadi
// "pasta gigi" tidak ikut menyumbang "gigi" ke Kesehatan, "air mineral" tidak ke "air".
const STRONG: Record<ExpenseCategoryKey, string[]> = {
  makan_harian: [
    "makan", "nasi", "nasgor", "bakso", "mie", "mi ayam", "mie ayam", "soto", "sate", "ayam", "bebek", "ikan", "padang",
    "warteg", "gado-gado", "gado", "pecel", "lontong", "ketoprak", "bubur", "roti", "sarapan", "lauk", "sayur", "sayuran",
    "beras", "telur", "telor", "minyak goreng", "gofood", "go food", "grabfood", "grab food", "shopeefood", "shopee food", "katering", "catering", "rames",
    "geprek", "burger", "pizza", "kfc", "mcd", "mekdi", "hokben", "indomie", "galon", "air mineral", "aqua",
    "belanja dapur", "dapur"
  ],
  transport: [
    "ojek", "ojol", "gojek", "goride", "go ride", "gocar", "go car", "grab", "grabbike", "grab bike", "grabcar", "grab car", "maxim", "indrive", "bensin", "pertalite",
    "pertamax", "solar", "bbm", "parkir", "tol", "e-toll", "etoll", "e toll", "busway", "transjakarta", "krl", "commuter", "mrt",
    "lrt", "kereta", "angkot", "bus", "bis", "taksi", "taxi", "bluebird", "travel", "bengkel", "servis motor",
    "service motor", "ganti oli", "tambal ban", "cuci motor", "cuci mobil"
  ],
  pulsa_internet: [
    "pulsa", "kuota", "paket data", "internet", "wifi", "wi-fi", "wi fi", "indihome", "telkomsel", "tsel", "xl", "axis", "indosat",
    "im3", "tri", "smartfren", "by.u", "byu", "biznet", "first media", "myrepublic", "iconnet"
  ],
  listrik_kos: ["listrik", "token", "pln", "pdam", "kos", "kost", "kosan", "sewa", "kontrakan", "ipl", "iuran", "sampah", "gas", "elpiji", "lpg"],
  langganan: [
    "langganan", "spotify", "netflix", "youtube premium", "yt premium", "disney", "hotstar", "vidio", "viu", "wetv",
    "iqiyi", "prime video", "apple music", "icloud", "google one", "canva", "chatgpt", "claude", "notion"
  ],
  kesehatan: [
    "obat", "apotek", "apotik", "dokter", "dokter gigi", "gigi", "klinik", "rumah sakit", "rs", "puskesmas", "vitamin",
    "suplemen", "bpjs", "periksa", "cek darah", "kacamata", "masker", "halodoc", "alodokter"
  ],
  sosial: [
    "sedekah", "infaq", "infak", "zakat", "donasi", "kondangan", "amplop", "kado", "hadiah", "sumbangan", "bantu", "ortu",
    "orang tua", "mama", "papa", "adik", "keluarga", "arisan", "takziah", "kas rt"
  ],
  nongkrong: [
    "nongkrong", "jajan", "kopi", "ngopi", "coffee", "cafe", "kafe", "starbucks", "janji jiwa", "kopi kenangan", "kopken",
    "fore", "tomoro", "boba", "chatime", "mixue", "es teh", "esteh", "teh", "jus", "juice", "snack", "cemilan",
    "camilan", "martabak", "seblak", "cilok", "cireng", "gorengan", "batagor", "siomay", "es krim", "ice cream", "donat",
    "dessert", "nonton", "bioskop", "xxi", "cgv", "karaoke", "top up game", "topup game"
  ],
  belanja_kecil: [
    "sabun", "sampo", "shampo", "shampoo", "odol", "pasta gigi", "sikat gigi", "deterjen", "detergen", "rinso", "pewangi",
    "tisu", "tissue", "skincare", "sunscreen", "kosmetik", "makeup", "parfum", "baju", "kaos", "celana", "sepatu",
    "sandal", "kaus kaki", "charger", "kabel", "alat tulis", "pulpen", "buku", "laundry", "potong rambut", "cukur",
    "barbershop"
  ]
};

/** Kata yang lebih samar: hanya menang kalau tidak ada kata kunci yang lebih jelas. */
const WEAK: Partial<Record<ExpenseCategoryKey, string[]>> = {
  makan_harian: ["pasar"],
  listrik_kos: ["air"],
  sosial: ["ibu", "bapak", "kas"],
  belanja_kecil: ["belanja", "indomaret", "alfamart", "alfamidi", "minimarket", "shopee", "tokopedia", "tokped", "lazada", "blibli"]
};

const KEYWORDS = [
  ...Object.entries(STRONG).flatMap(([key, words]) => words.map((word) => ({ key, word, weight: 2 }))),
  ...Object.entries(WEAK).flatMap(([key, words]) => words.map((word) => ({ key, word, weight: 1 })))
]
  .sort((a, b) => b.word.length - a.word.length)
  .map(({ key, word, weight }) => ({
    key: key as ExpenseCategoryKey,
    weight,
    re: wordRegex(escapeRegExp(word).replace(/\s+/g, "\\s+"))
  }));

function detectCategory(text: string): ExpenseCategoryKey | null {
  let work = text;
  const score = new Map<ExpenseCategoryKey, number>();
  for (const k of KEYWORDS) {
    for (let hit = find(work, k.re); hit; hit = find(work, k.re)) {
      score.set(k.key, (score.get(k.key) ?? 0) + k.weight);
      work = blank(work, hit);
    }
  }
  // Skor seri: urutan kategori tepira.
  let best: ExpenseCategoryKey | null = null;
  let bestScore = 0;
  for (const c of expenseCategories) {
    const s = score.get(c.key) ?? 0;
    if (s > bestScore) {
      best = c.key;
      bestScore = s;
    }
  }
  return best;
}

// ── Tempat ───────────────────────────────────────────────────────────────────
/** "@warung pak kumis": kata-kata setelah "@" sampai koma, titik koma, atau akhir kalimat. */
const PLACE = /@\s*([^@,;]*)/u;

/**
 * Nama tempat dengan huruf seperti yang diketik ("KFC" tetap "KFC"); kalau diketik huruf kecil
 * semua, tiap kata diawali huruf besar.
 */
function placeDisplayName(typed: string, original: string) {
  const at = original.toLowerCase().indexOf(typed);
  const asTyped = at >= 0 ? original.slice(at, at + typed.length) : "";
  return asTyped && asTyped !== asTyped.toLowerCase() ? asTyped : titleCase(typed);
}

// ── Catatan ──────────────────────────────────────────────────────────────────
function cleanNote(text: string) {
  const note = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:beli|bli|bayar|byr)\s+/u, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/^[\s,.;:+\-–—]+|[\s,.;:+\-–—]+$/gu, "")
    .slice(0, 120);
  return note ? note[0].toUpperCase() + note.slice(1) : "";
}

export function parseQuickEntry(
  text: string,
  wallets: readonly QuickWallet[],
  today = new Date(),
  places: readonly KnownPlace[] = []
): QuickEntry {
  let rest = text.toLowerCase();

  let source: QuickEntry["source"] = null;
  const bonus = find(rest, BONUS);
  if (bonus) {
    source = "bonus";
    rest = blank(rest, bonus);
  }

  let daysAgo: number | null = null;
  for (const rule of DATE_RULES) {
    const hit = find(rest, rule.re);
    if (!hit) continue;
    daysAgo = rule.days(hit.groups, today);
    rest = blank(rest, hit);
    break;
  }

  let walletId: number | null = null;
  for (const { id, re } of walletMatchers(wallets)) {
    const hit = find(rest, re);
    if (!hit) continue;
    walletId = id;
    rest = blank(rest, hit);
    break;
  }

  const placeSpan = PLACE.exec(rest);
  const amount = findAmount(rest, placeSpan && { start: placeSpan.index, end: placeSpan.index + placeSpan[0].length });
  if (amount) rest = blank(rest, amount);

  // Nama tempat diambil setelah nominal & dompet dibuang, supaya "15rb gopay" sesudah "@…" tidak ikut.
  let place: QuickEntry["place"] = null;
  const at = PLACE.exec(rest);
  if (at) {
    const typed = at[1].replace(/\s+/g, " ").trim();
    rest = `${rest.slice(0, at.index)} ${rest.slice(at.index + at[0].length)}`;
    if (typed) {
      const known = matchKnownPlace(typed, places);
      place = known
        ? { name: known.name, lat: known.lat, lng: known.lng }
        : { name: placeDisplayName(typed, text), lat: null, lng: null };
    }
  }

  return {
    amount: amount?.value ?? null,
    assumedThousands: amount?.assumed ?? false,
    // Kata kategorinya tetap jadi catatan ("Bakso"), jadi dibaca dari sisa kalimat tanpa dibuang.
    // Kalau catatannya tidak memberi petunjuk, nama tempat juga bisa ("@indomaret" → Belanja kecil).
    categoryKey: detectCategory(rest) ?? (place ? detectCategory(place.name.toLowerCase()) : null),
    walletId,
    daysAgo,
    source,
    place,
    note: cleanNote(rest)
  };
}
