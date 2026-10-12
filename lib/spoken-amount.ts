/**
 * Bilangan yang diucapkan → angka, untuk 🎤 catat lewat suara (Web Speech id-ID).
 *   "bakso lima belas ribu gopay"  → "bakso Rp15.000 gopay"
 *   "parkir goceng"                → "parkir Rp5.000"
 *   "tiga hari yang lalu"          → "3 hari yang lalu"   (tanpa satuan uang = angka biasa)
 * Hasilnya dibaca parseQuickEntry seperti kalimat yang diketik. Bilangan bernilai uang (ada ribu/juta/
 * ratus/slang/rupiah) ditulis "Rp" + titik ribuan supaya terbaca nominal yang jelas, bukan "dianggap
 * ribuan" ("lima ratus" = Rp500, bukan Rp500.000). Tanpa lookbehind (Safari iOS lama).
 */

const UNITS: Record<string, number> = { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9 };
const SCALES: Record<string, number> = { ribu: 1e3, rebu: 1e3, juta: 1e6, miliar: 1e9, milyar: 1e9 };
const SE_SCALES: Record<string, number> = { seribu: 1e3, serebu: 1e3, sejuta: 1e6, semiliar: 1e9, semilyar: 1e9 };
const SLANG: Record<string, number> = { cepek: 100, gopek: 500, seceng: 1e3, noceng: 2e3, goceng: 5e3, ceban: 1e4, goban: 5e4 };
const MONEY_SUFFIX = new Set(["rupiah", "perak"]);
const MONEY_PREFIX = /^rp\.?$/;
const DIGITS = /^\d+(?:[.,]\d+)*$/;

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
  money: boolean;
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

const isScale = (w: string | undefined) => w !== undefined && w in SCALES;

/** Bilangan terpanjang yang sah mulai token `i`; null kalau token itu bukan awal bilangan. */
function readRun(toks: Token[], i: number): Run | null {
  const from = i;
  let total = 0;
  let small = 0;
  let unit = 0;
  let half = false;
  let lastScale = Infinity;
  let afterScale = false;
  let money = false;
  let spoken = false;
  let good: Run | null = null;
  if (MONEY_PREFIX.test(toks[i].word) && !toks[i].stop && i + 1 < toks.length) {
    money = true;
    i++;
  }
  for (; i < toks.length; i++) {
    const w = toks[i].word;
    let terminal = false;
    if (w in UNITS) {
      if (unit || small % 10 !== 0) break;
      unit = UNITS[w];
    } else if (w === "sepuluh" || w === "sebelas") {
      if (unit || small % 100 !== 0) break;
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
      // hanya "setengah juta" / "satu setengah juta"; "setengah porsi" bukan bilangan
      if (half || !isScale(toks[i + 1]?.word)) break;
      half = true;
      spoken = true;
      continue;
    } else if (w in SCALES || w in SE_SCALES) {
      const scale = SCALES[w] ?? SE_SCALES[w];
      let n = small + unit + (half ? 0.5 : 0);
      if (w in SE_SCALES) {
        if (n) break;
        n = 1;
      }
      if (!n || scale >= lastScale) break;
      total += n * scale;
      small = 0;
      unit = 0;
      half = false;
      lastScale = scale;
      money = true;
    } else if (w in SLANG) {
      if (total || small || unit) break;
      total = SLANG[w];
      money = true;
      terminal = true;
    } else if (DIGITS.test(w)) {
      if (small || unit) break;
      const v = digitValue(w);
      const nextScale = isScale(toks[i + 1]?.word) || toks[i + 1]?.word === "setengah";
      // "2 ribu 500" = 2.500, tapi "2 ribu 3 gelas" berhenti di "2 ribu"
      if (!Number.isFinite(v) || (total && !nextScale && (v < 100 || v >= lastScale))) break;
      small = v;
    } else break;
    if (!DIGITS.test(w)) spoken = true;
    // "tiga ribu lima" = 3.500, "sejuta dua" = 1.200.000: satu angka langsung sesudah satuan = persepuluhannya
    const colloquial = afterScale && unit && !small ? unit * (lastScale / 10) - unit : 0;
    afterScale = w in SCALES || w in SE_SCALES;
    good = { from, to: i, value: total + small + unit + colloquial, money, spoken };
    if (terminal || toks[i].stop) break;
  }
  if (!good) return null;
  const next = toks[good.to + 1];
  if (next && MONEY_SUFFIX.has(next.word) && !toks[good.to].stop) {
    good = { ...good, to: good.to + 1, money: true, spoken: true };
  }
  return good;
}

const dotted = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export function normalizeSpokenAmounts(text: string): string {
  const toks = tokenize(text);
  let out = "";
  let cursor = 0;
  for (let i = 0; i < toks.length; ) {
    const run = readRun(toks, i);
    // Angka digit sendirian ("15.000", "3", "Rp15.000") dibiarkan: itu wilayah parseQuickEntry.
    if (!run || run.value <= 0 || (!run.spoken && run.to === run.from)) {
      i++;
      continue;
    }
    out += text.slice(cursor, toks[run.from].start) + (run.money ? `Rp${dotted(run.value)}` : String(Math.round(run.value)));
    cursor = toks[run.to].end;
    i = run.to + 1;
  }
  return out + text.slice(cursor);
}
