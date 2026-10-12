/**
 * Bilangan yang diucapkan → angka, untuk 🎤 catat lewat suara (Web Speech id-ID).
 *   "bakso lima belas ribu gopay"  → "bakso Rp15.000 gopay"
 *   "parkir goceng"                → "parkir Rp5.000"
 *   "tiga hari yang lalu"          → "3 hari yang lalu"   (tanpa satuan uang = angka biasa)
 * Hasilnya dibaca parseQuickEntry seperti kalimat yang diketik. Bilangan bernilai uang (ada ribu/juta/
 * ratus/slang/rupiah) ditulis "Rp" + titik ribuan supaya terbaca nominal yang jelas, bukan "dianggap
 * ribuan" ("lima ratus" = Rp500, bukan Rp500.000). Tanpa lookbehind (Safari iOS lama).
 */

// Tabel kata tanpa prototipe: "constructor" / "__proto__" bukan bilangan.
const table = (entries: Record<string, number>): Record<string, number> => Object.assign(Object.create(null), entries);
const UNITS = table({ satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9 });
const SCALES = table({ ribu: 1e3, rebu: 1e3, juta: 1e6, miliar: 1e9, milyar: 1e9 });
const SE_SCALES = table({ seribu: 1e3, serebu: 1e3, sejuta: 1e6, semiliar: 1e9, semilyar: 1e9 });
const SLANG = table({ cepek: 100, gopek: 500, seceng: 1e3, noceng: 2e3, goceng: 5e3, ceban: 1e4, goban: 5e4 });
const has = (t: Record<string, number>, w: string | undefined) => w !== undefined && t[w] !== undefined;
const MONEY_SUFFIX = new Set(["rupiah", "perak"]);
const MONEY_PREFIX = /^rp\.?$/;
const DIGITS = /^\d+(?:[.,]\d+)*$/;
/**
 * Kata hitungan/waktu: angka satuan sebelum kata ini bukan bagian nominal ("lima puluh ribu dua hari
 * yang lalu" = Rp50.000 + "2 hari", bukan Rp50.200), dan "setengah" sebelumnya bukan setengah nominal.
 */
const COUNT_WORDS = new Set([
  "hari", "minggu", "bulan", "tahun", "jam", "menit", "kali", "x", "porsi", "gelas", "cup", "botol", "bungkus", "bks",
  "piring", "mangkok", "mangkuk", "potong", "buah", "biji", "butir", "lembar", "pcs", "pack", "kotak", "dus", "liter",
  "kilo", "kg", "ons", "gram", "gr", "orang", "tiket", "lusin"
]);

interface Token {
  word: string;
  start: number;
  end: number;
  /** ada tanda baca di ujung kata ("ribu,"): bilangan berhenti di sini */
  stop: boolean;
}
interface Run {
  from: number;
  to: number;
  value: number;
  /** bernilai uang (ditulis "Rp…") */
  money: boolean;
  /** uangnya jelas: ada ribu/juta, slang, "rp", atau "rupiah"; "lima ratus" saja belum tentu harga */
  strong: boolean;
  spoken: boolean;
}

/** Per kata (dipisah spasi). Tanda baca di ujung memutus bilangan tapi tetap tinggal di teks. */
function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const re = /\S+/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const trail = /[,.;:!?]+$/.exec(m[0])?.[0] ?? "";
    const core = m[0].slice(0, m[0].length - trail.length);
    out.push({ word: core.toLowerCase(), start: m.index, end: m.index + core.length, stop: trail.length > 0 });
  }
  return out;
}

/** "15.000" / "1,5" seperti toNumber di quick-entry (kelompok 3 digit = ribuan). */
function digitValue(s: string) {
  const parts = s.split(/[.,]/);
  if (parts.length === 1) return Number(s);
  if (parts.slice(1).every((p) => p.length === 3)) return Number(parts.join(""));
  return parts.length === 2 ? Number(`${parts[0]}.${parts[1]}`) : Number.NaN;
}

const isScale = (w: string | undefined) => has(SCALES, w);

/** Bilangan terpanjang yang sah mulai token `i`; null kalau token itu bukan awal bilangan. */
function readRun(toks: Token[], i: number): Run | null {
  const from = i;
  let total = 0;
  let small = 0;
  let unit = 0;
  let half = false;
  let lastScale = Infinity;
  let afterScale = false;
  /** `small` berasal dari angka digit ("50.000"): kata satuan sesudahnya bukan lanjutannya */
  let digitSmall = false;
  let money = false;
  let strong = false;
  let spoken = false;
  let good: Run | null = null;
  /** "tiga ribu lima": run sebelum satuan tunggal sesudah skala, dan di token mana satuan itu */
  let beforeLone: Run | null = null;
  let loneAt = -1;
  if (MONEY_PREFIX.test(toks[i].word) && !toks[i].stop && i + 1 < toks.length) {
    money = true;
    strong = true;
    i++;
  }
  for (; i < toks.length; i++) {
    const w = toks[i].word;
    const next = toks[i + 1]?.word;
    let terminal = false;
    let lone = false;
    if (has(UNITS, w)) {
      if (unit || digitSmall || small % 10 !== 0) break;
      lone = afterScale && !small;
      if (lone) beforeLone = good;
      unit = UNITS[w];
    } else if (w === "sepuluh" || w === "sebelas") {
      if (unit || digitSmall || small % 100 !== 0) break;
      small += w === "sepuluh" ? 10 : 11;
    } else if (w === "belas" || w === "puluh") {
      if (!unit || small % 100 !== 0) break;
      small += w === "belas" ? 10 + unit : unit * 10;
      unit = 0;
    } else if (w === "ratus" || w === "seratus") {
      if (small || (w === "ratus" ? !unit : unit)) break;
      small = (w === "ratus" ? unit : 1) * 100;
      unit = 0;
      money = true;
    } else if (w === "setengah") {
      if (!afterScale) {
        // "setengah juta" / "satu setengah juta"; "setengah porsi" bukan bilangan
        if (half || !isScale(next)) break;
        half = true;
        spoken = true;
        continue;
      }
      // "sejuta setengah" = 1,5 juta, tapi "sepuluh ribu setengah porsi" berhenti di "sepuluh ribu"
      if (small || unit || half || (next !== undefined && COUNT_WORDS.has(next))) break;
      total += lastScale / 2;
      terminal = true;
    } else if (has(SCALES, w) || has(SE_SCALES, w)) {
      const scale = SCALES[w] ?? SE_SCALES[w];
      let n = small + unit + (half ? 0.5 : 0);
      if (has(SE_SCALES, w)) {
        if (n) break;
        n = 1;
      }
      if (!n || scale >= lastScale) break;
      total += n * scale;
      small = 0;
      unit = 0;
      half = false;
      digitSmall = false;
      lastScale = scale;
      money = true;
      strong = true;
    } else if (has(SLANG, w)) {
      if (total || small || unit) break;
      total = SLANG[w];
      money = true;
      strong = true;
      terminal = true;
    } else if (DIGITS.test(w)) {
      if (small || unit) break;
      const v = digitValue(w);
      const nextScale = isScale(next) || next === "setengah";
      // "2 ribu 500" = 2.500, tapi "2 ribu 3 gelas" berhenti di "2 ribu"
      if (!Number.isFinite(v) || (total && !nextScale && (v < 100 || v >= lastScale))) break;
      small = v;
      digitSmall = true;
    } else break;
    if (!DIGITS.test(w)) spoken = true;
    // "tiga ribu lima" = 3.500, "sejuta dua" = 1.200.000: satu angka langsung sesudah satuan = persepuluhannya
    const colloquial = lone ? unit * (lastScale / 10) - unit : 0;
    // "satu juta dua ratus" / "2 juta 500" = …200.000 / …500.000: sisa puluhan/ratusan sesudah juta (tanpa "ribu") berarti ribuan
    const rest = small + unit;
    const thousands = lastScale !== Infinity && lastScale >= 1e6 && !lone && rest >= 10 && rest < 1000 ? rest * (lastScale / 1000) - rest : 0;
    afterScale = has(SCALES, w) || has(SE_SCALES, w);
    loneAt = lone ? i : -1;
    good = { from, to: i, value: total + rest + colloquial + thousands, money, strong, spoken };
    if (terminal || toks[i].stop) break;
  }
  if (!good) return null;
  // Satuan tunggal sesudah skala yang diikuti kata hitungan ("… ribu dua hari") bukan bagian nominal.
  const after = toks[good.to + 1];
  if (loneAt === good.to && beforeLone && !toks[good.to].stop && after && COUNT_WORDS.has(after.word)) good = beforeLone;
  const next = toks[good.to + 1];
  if (next && MONEY_SUFFIX.has(next.word) && !toks[good.to].stop) {
    good = { ...good, to: good.to + 1, money: true, strong: true, spoken: true };
  }
  return good;
}

const dotted = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export function normalizeSpokenAmounts(text: string): string {
  const toks = tokenize(text);
  const runs: Run[] = [];
  for (let i = 0; i < toks.length; ) {
    const run = readRun(toks, i);
    // Angka digit sendirian ("15.000", "3", "Rp15.000") dibiarkan: itu wilayah parseQuickEntry.
    if (!run || !(run.value > 0) || (!run.spoken && run.to === run.from)) {
      i++;
      continue;
    }
    runs.push(run);
    i = run.to + 1;
  }
  // Ada harga yang jelas ("delapan puluh ribu")? Maka "lima ratus gram" hanya jumlah, bukan nominal.
  const priced = runs.some((r) => r.strong);
  let out = "";
  let cursor = 0;
  for (const run of runs) {
    const asMoney = run.money && (run.strong || !priced);
    out += text.slice(cursor, toks[run.from].start) + (asMoney ? `Rp${dotted(run.value)}` : String(Math.round(run.value)));
    cursor = toks[run.to].end;
  }
  return out + text.slice(cursor);
}
