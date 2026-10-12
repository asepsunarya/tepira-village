import { DAY_MS, wibDayDate } from "./game";

/**
 * Musim pulau & jurnal tahunan. Murni (tanpa React/three) supaya bisa dites.
 *
 * Empat musim ala Indonesia per bulan kalender: hujan (Nov–Feb), panen (Mar–Apr, pancaroba pertama),
 * kemarau (Mei–Agu), dan mangga (Sep–Okt, pancaroba kedua). Salju tidak cocok untuk desa bercaping.
 * Pulau memakai musim bulan yang DILIHAT (seperti cuaca & kios); hitungan "hari ke-N" dan kalender
 * kebiasaan memakai hari ini (WIB), seperti lampu streak.
 */

export type SeasonKey = "hujan" | "panen" | "kemarau" | "mangga";

export interface SeasonInfo {
  key: SeasonKey;
  name: string;
  emoji: string;
  /** bulan 1..12, urut sejak musim dimulai */
  months: readonly number[];
  blurb: string;
}

export const SEASONS: Record<SeasonKey, SeasonInfo> = {
  hujan: {
    key: "hujan",
    name: "Musim hujan",
    emoji: "🌧️",
    months: [11, 12, 1, 2],
    blurb: "Hujan turun hampir tiap sore, kolam desa penuh, dan rumput paling hijau. Payung jangan sampai ketinggalan."
  },
  panen: {
    key: "panen",
    name: "Musim panen",
    emoji: "🌾",
    months: [3, 4],
    blurb: "Pancaroba pertama: padi menguning dan lumbung terisi. Waktu yang pas buat menghitung hasil jerih payah."
  },
  kemarau: {
    key: "kemarau",
    name: "Musim kemarau",
    emoji: "☀️",
    months: [5, 6, 7, 8],
    blurb: "Hari panjang dan kering, anginnya pas untuk layangan. Air kolam surut, jadi yang hemat-hemat juga ya."
  },
  mangga: {
    key: "mangga",
    name: "Musim mangga",
    emoji: "🥭",
    months: [9, 10],
    blurb: "Pancaroba kedua: pohon mangga berbuah lebat dan daun mulai berguguran. Siap-siap, musim hujan sebentar lagi."
  }
};

const MONTH_SEASON: readonly SeasonKey[] = [
  "hujan", "hujan", "panen", "panen", "kemarau", "kemarau",
  "kemarau", "kemarau", "mangga", "mangga", "hujan", "hujan"
];

/** Indeks bulan 0..11; bulan di luar 1..12 diputar (0 = Desember, 13 = Januari). */
const monthIndex = (month: number) => (((Math.trunc(month) - 1) % 12) + 12) % 12;

export function seasonForMonth(month: number): SeasonKey {
  return MONTH_SEASON[monthIndex(month)] ?? "hujan";
}

/** Perayaan yang ikut menghias pulau di bulan itu. */
export function festivalFor(month: number): "agustusan" | null {
  return monthIndex(month) === 7 ? "agustusan" : null;
}

/** Tanggal kalender WIB dari hari WIB (lihat wibDay). */
export function wibDateParts(day: number): { year: number; month: number; date: number } {
  const d = wibDayDate(day);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, date: d.getUTCDate() };
}

/** Hari WIB untuk tanggal kalender. Bulan boleh meluap (13 = Januari tahun berikutnya). */
export function wibDayOf(year: number, month: number, date = 1) {
  return Date.UTC(year, month - 1, date) / DAY_MS;
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export interface YearProgress {
  year: number;
  /** 1 Januari = 1 */
  dayOfYear: number;
  /** 365 atau 366 */
  daysInYear: number;
  /** hari tersisa setelah hari ini (31 Desember = 0) */
  daysLeft: number;
  /** 0..1, hari ini ikut dihitung */
  fraction: number;
}

export function yearProgress(day: number): YearProgress {
  const { year } = wibDateParts(day);
  const jan1 = wibDayOf(year, 1);
  const daysInYear = wibDayOf(year + 1, 1) - jan1;
  const dayOfYear = day - jan1 + 1;
  return { year, dayOfYear, daysInYear, daysLeft: daysInYear - dayOfYear, fraction: dayOfYear / daysInYear };
}

/** Pergantian musim berikutnya setelah `day`: musimnya, hari WIB tanggal 1-nya, dan berapa hari lagi. */
export function nextSeasonChange(day: number): { season: SeasonKey; day: number; inDays: number } {
  const { year, month } = wibDateParts(day);
  const now = seasonForMonth(month);
  for (let k = 1; k <= 12; k++) {
    const season = seasonForMonth(month + k);
    if (season !== now) {
      const start = wibDayOf(year, month + k);
      return { season, day: start, inDays: start - day };
    }
  }
  // Tidak mungkin terjadi: tiap musim paling lama 4 bulan.
  return { season: now, day, inDays: 0 };
}

/**
 * Keadaan satu hari di kalender kebiasaan:
 * - `recorded`: ada pengeluaran/setoran bertanggal hari itu (menang atas tanda nol, sama seperti computeStreak)
 * - `nospend`: ditandai nol pengeluaran
 * - `missed`: sudah lewat, tidak tercatat
 * - `future`: belum terjadi, termasuk hari ini selama belum tercatat (harinya belum selesai)
 * - `before`: sebelum catatan pertama yang diketahui, supaya akun baru tidak melihat setahun "terlewat"
 */
export type HabitState = "recorded" | "nospend" | "missed" | "future" | "before";

export interface HabitMonth {
  month: number;
  /** hari WIB tanggal 1 */
  start: number;
  /** satu per tanggal (28–31) */
  days: HabitState[];
  done: number;
}

export interface HabitYear {
  months: HabitMonth[];
  /** hari tercatat + nol pengeluaran */
  done: number;
  /** hari yang sudah bisa dinilai: done + missed (tanpa `before` & `future`) */
  elapsed: number;
  /** deret terpanjang di tahun ini saja */
  longestRun: number;
}

/** Kalender kebiasaan mencatat satu tahun dari activityDays (server) + tanda nol pengeluaran (browser). */
export function habitYear(
  activity: readonly number[],
  noSpend: readonly number[],
  year: number,
  today: number
): HabitYear {
  // Catatan bertanggal masa depan tidak dihitung, sama seperti computeStreak.
  const recorded = new Set(activity.filter((d) => d <= today));
  const marked = new Set(noSpend.filter((d) => d <= today));
  let first = Infinity;
  for (const d of recorded) first = Math.min(first, d);
  for (const d of marked) first = Math.min(first, d);

  let done = 0;
  let elapsed = 0;
  let run = 0;
  let longestRun = 0;
  const months = Array.from({ length: 12 }, (_, i): HabitMonth => {
    const month = i + 1;
    const start = wibDayOf(year, month);
    let monthDone = 0;
    const days = Array.from({ length: daysInMonth(year, month) }, (_, k): HabitState => {
      const d = start + k;
      const state: HabitState = recorded.has(d)
        ? "recorded"
        : marked.has(d)
          ? "nospend"
          : d >= today
            ? "future"
            : d < first
              ? "before"
              : "missed";
      if (state === "recorded" || state === "nospend") {
        monthDone++;
        done++;
        elapsed++;
        run++;
        longestRun = Math.max(longestRun, run);
      } else {
        if (state === "missed") elapsed++;
        run = 0;
      }
      return state;
    });
    return { month, start, days, done: monthDone };
  });
  return { months, done, elapsed, longestRun };
}

const HEX = /^#?([0-9a-f]{6})$/i;

/**
 * Campur dua warna `#rrggbb` di ruang sRGB (bilangan bulat per kanal), hasil huruf kecil.
 * `t` dijepit 0..1 (0 = a, 1 = b). Warna yang tidak terbaca mengembalikan `a` apa adanya.
 */
export function mixHex(a: string, b: string, t: number): string {
  const ma = HEX.exec(a.trim());
  const mb = HEX.exec(b.trim());
  if (!ma || !mb) return a;
  const ca = parseInt(ma[1], 16);
  const cb = parseInt(mb[1], 16);
  const k = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const channel = (shift: number) => {
    const from = (ca >> shift) & 255;
    const to = (cb >> shift) & 255;
    return Math.round(from + (to - from) * k);
  };
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, "0")}`;
}
