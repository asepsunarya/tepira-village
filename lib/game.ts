/**
 * Tipe & aturan "game" yang dipakai bersama server (snapshot) dan client (desa 3D).
 * Semua angka uang dalam Rupiah bulat (sama seperti kolom Int di skema tepira).
 */

export interface ContributionView {
  id: number;
  amount: number;
  note: string | null;
  date: string;
}

export interface GoalView {
  id: number;
  title: string;
  description: string | null;
  targetAmount: number;
  deadline: string | null;
  createdAt: string;
  saved: number;
  /** 0..1, dibatasi maksimal 1 untuk keperluan visual. */
  progress: number;
  contributions: ContributionView[];
}

export interface WalletView {
  id: number;
  name: string;
  type: string;
  balance: number;
  description: string | null;
  isDebt: boolean;
  sortOrder: number;
}

export interface ExpenseView {
  id: number;
  amount: number;
  category: string | null;
  note: string | null;
  source: string;
  date: string;
  walletId: number | null;
  walletName: string | null;
  /** Lokasi opsional (peta jajan). Nama boleh tanpa titik; titik tanpa nama tetap muncul di peta. */
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Tempat yang pernah dicatat lengkap dengan titiknya, untuk dipakai ulang (chip & "@nama" di catat cepat). */
export interface KnownPlace {
  name: string;
  lat: number;
  lng: number;
  /** berapa kali dipakai dalam setahun terakhir */
  count: number;
}

export interface SalaryAllocationView {
  /** Label kategori (sama seperti yang disimpan tepira, mis. "Makan harian"). */
  category: string;
  amount: number;
}

/** Alokasi gaji satu bulan (tabel Salary + BudgetAllocation di tepira). */
export interface SalaryView {
  id: number;
  amount: number;
  totalExpenseAllocation: number;
  savingsAllocation: number;
  allocations: SalaryAllocationView[];
}

export type HealthStatus = "SANGAT SEHAT" | "SEHAT" | "CUKUP" | "PERLU DIJAGA";

export interface MonthSummary {
  month: number;
  year: number;
  startingBalance: number;
  income: { salary: number; bonus: number; total: number };
  savingsAllocation: number;
  expenses: { total: number; count: number };
  budget: { limit: number; remaining: number; status: "OVER_BUDGET" | "WITHIN_BUDGET" | "NO_BUDGET" };
  savedThisMonth: number;
  savingsRate: number;
  byCategory: Record<string, number>;
  health: {
    score: number;
    status: HealthStatus;
    savingScore: number;
    budgetDiscipline: number;
    runwayMonths: number;
    runwayScore: number;
    debtScore: number;
  };
}

/** Baris WeeklyFinancialInsight tepira (dibuat cron tepira tiap Senin 08:00 WIB). */
export interface InsightView {
  id: number;
  weekStart: string;
  weekEnd: string;
  healthScore: number;
  status: string;
  summary: string;
  recommendations: string[];
}

export interface Snapshot {
  user: { name: string | null; email: string | null; image: string | null };
  period: { month: number; year: number };
  goals: GoalView[];
  wallets: WalletView[];
  expenses: ExpenseView[];
  summary: MonthSummary;
  /** Alokasi gaji bulan terpilih, null kalau belum diatur. */
  salary: SalaryView | null;
  /** Alokasi gaji terakhir sebelum bulan terpilih (untuk "Salin dari bulan lalu"). */
  previousSalary: (SalaryView & { month: number; year: number }) | null;
  /**
   * Hari WIB (lihat wibDay) yang punya pengeluaran atau setoran, ACTIVITY_WINDOW_DAYS terakhir,
   * urut naik. Dasar lampu streak & warga; tidak ikut bulan yang sedang dilihat.
   */
  activityDays: number[];
  /** Insight mingguan tepira terbaru sampai bulan yang dilihat, null kalau belum ada. */
  insight: InsightView | null;
  /** Tempat jajan yang pernah dicatat (setahun terakhir), paling sering dulu. */
  places: KnownPlace[];
  /**
   * Nama tempat (dinormalkan, lihat normalizePlaceName) yang tercatat setahun sebelum bulan yang
   * dilihat, untuk "Pertama kali bulan ini" di peta jajan.
   */
  placesBefore: string[];
  totals: {
    totalSaved: number;
    contributionCount: number;
    assets: number;
    debts: number;
    netWorth: number;
  };
  pinRequired: boolean;
  devLogin: boolean;
  generatedAt: string;
}

export type ActionResult =
  | { ok: true; snapshot: Snapshot }
  | { ok: false; message: string };

// ── Level desa ───────────────────────────────────────────────────────────────
// 1 XP tiap Rp10.000 yang ditabung + 5 XP per setoran (konsistensi dihargai,
// sesuai semangat "teu pira": setoran kecil pun berarti).
export const XP_PER_RUPIAH = 1 / 10_000;
export const XP_PER_CONTRIBUTION = 5;

export function villageXp(totalSaved: number, contributionCount: number) {
  return Math.floor(totalSaved * XP_PER_RUPIAH + contributionCount * XP_PER_CONTRIBUTION);
}

/** XP kumulatif yang dibutuhkan untuk mencapai `level` (level 1 = 0). */
export function xpForLevel(level: number) {
  return Math.round(60 * Math.pow(Math.max(0, level - 1), 1.6));
}

export function levelFor(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp && level < 999) level++;
  return level;
}

export function levelTitle(level: number) {
  if (level >= 40) return "Legenda Desa";
  if (level >= 25) return "Kepala Desa";
  if (level >= 15) return "Saudagar";
  if (level >= 8) return "Penabung Tekun";
  if (level >= 4) return "Warga Rajin";
  return "Pendatang Baru";
}

/** Tahap bangunan goal dari progres 0..1. */
export type BuildStage = "lahan" | "fondasi" | "dinding" | "atap" | "selesai";
export function buildStage(progress: number): BuildStage {
  if (progress >= 1) return "selesai";
  if (progress >= 0.7) return "atap";
  if (progress >= 0.3) return "dinding";
  if (progress > 0) return "fondasi";
  return "lahan";
}

export const WALLET_TYPES = [
  { key: "bank", label: "Bank", emoji: "🏦" },
  { key: "e-wallet", label: "E-wallet", emoji: "📱" },
  { key: "cash", label: "Tunai", emoji: "💵" },
  { key: "investment", label: "Investasi", emoji: "📈" },
  { key: "credit", label: "Kartu kredit", emoji: "💳" },
  { key: "paylater", label: "Paylater", emoji: "🧾" },
  { key: "other", label: "Lainnya", emoji: "👛" }
] as const;

export function walletEmoji(type: string) {
  return WALLET_TYPES.find((t) => t.key === type)?.emoji ?? "👛";
}

export function healthStatusFor(score: number): HealthStatus {
  if (score >= 85) return "SANGAT SEHAT";
  if (score >= 70) return "SEHAT";
  if (score >= 55) return "CUKUP";
  return "PERLU DIJAGA";
}

// ── Hari WIB ─────────────────────────────────────────────────────────────────
// Lampu, streak, dan warga dihitung per hari kalender WIB, sama seperti minggu
// insight di tepira (getWibWeekRange). Satu hari = bilangan bulat: jumlah hari
// sejak 1 Januari 1970 WIB. Server dan browser selalu sepakat, apa pun zona jamnya.
export const DAY_MS = 86_400_000;
export const WIB_OFFSET_MS = 7 * 3_600_000;

export function wibDay(time: number | string | Date) {
  const ms = typeof time === "number" ? time : new Date(time).getTime();
  return Math.floor((ms + WIB_OFFSET_MS) / DAY_MS);
}

/** Tengah malam UTC bertanggal sama dengan hari WIB itu: format dengan `timeZone: "UTC"`. */
export function wibDayDate(day: number) {
  return new Date(day * DAY_MS);
}

/** Senin (hari WIB) dari minggu yang memuat `day`. */
export function wibWeekStart(day: number) {
  return day - ((wibDayDate(day).getUTCDay() + 6) % 7);
}

/** Berapa hari ke belakang aktivitas dikirim ke browser (cukup untuk streak & warga setahun lebih). */
export const ACTIVITY_WINDOW_DAYS = 400;

// ── Streak catatan harian & warga ────────────────────────────────────────────
// Hari "tercatat" = ada pengeluaran atau setoran bertanggal hari itu, atau user
// menandainya "nol pengeluaran" supaya hari hemat tidak memutus streak. Yang
// dihargai kebiasaan mencatat, bukan besar belanjanya.

export const STREAK_DAYS_PER_VILLAGER = 7;
/**
 * Tanda "nol pengeluaran" boleh untuk hari ini dan 2 hari sebelumnya (lupa buka aplikasi saat
 * akhir pekan). Lebih dari itu streak memang putus; tanpa batas ini akun baru bisa langsung
 * menandai seminggu ke belakang dan dapat warga di hari pertama.
 */
export const NOSPEND_BACKFILL_DAYS = 2;
/** Warga yang pindah ke desa, satu tiap kelipatan 7 hari beruntun, sesuai urutan datang. */
export const VILLAGER_NAMES = ["Ujang", "Euis", "Dadang", "Neng", "Cecep", "Iis", "Jajang", "Lilis"] as const;
export const MAX_VILLAGERS = VILLAGER_NAMES.length;

export interface StreakDay {
  day: number;
  /** ada pengeluaran/setoran bertanggal hari itu */
  recorded: boolean;
  /** ditandai "nol pengeluaran" dan memang tidak ada catatan */
  noSpend: boolean;
}

export interface StreakInfo {
  today: number;
  todayDone: boolean;
  /** hari beruntun sampai hari ini, atau sampai kemarin selama hari ini belum tercatat */
  current: number;
  longest: number;
  /** 7 hari terakhir, paling lama dulu: indeks 6 = hari ini */
  week: StreakDay[];
  villagers: number;
  /** hari beruntun lagi sampai warga berikutnya datang; 0 kalau semua rumah sudah terisi */
  nextVillagerIn: number;
}

export function computeStreak(activityDays: readonly number[], noSpendDays: readonly number[], today: number): StreakInfo {
  // Catatan bertanggal masa depan tidak dihitung.
  const recorded = new Set(activityDays.filter((d) => d <= today));
  const marked = new Set(noSpendDays.filter((d) => d <= today));
  const done = (d: number) => recorded.has(d) || marked.has(d);

  let current = 0;
  for (let d = done(today) ? today : today - 1; done(d); d--) current++;

  // Warga dihitung dari semua deret: tiap kali satu deret mencapai kelipatan 7 hari, satu warga datang
  // dan menetap walaupun deretnya kemudian putus.
  let longest = 0;
  let milestones = 0;
  let run = 0;
  let prev = Number.NaN;
  for (const d of [...new Set([...recorded, ...marked])].sort((a, b) => a - b)) {
    run = d === prev + 1 ? run + 1 : 1;
    prev = d;
    longest = Math.max(longest, run);
    if (run % STREAK_DAYS_PER_VILLAGER === 0) milestones++;
  }
  const villagers = Math.min(MAX_VILLAGERS, milestones);

  return {
    today,
    todayDone: done(today),
    current,
    longest,
    week: Array.from({ length: 7 }, (_, i) => {
      const day = today - 6 + i;
      return { day, recorded: recorded.has(day), noSpend: !recorded.has(day) && marked.has(day) };
    }),
    villagers,
    nextVillagerIn: villagers >= MAX_VILLAGERS ? 0 : STREAK_DAYS_PER_VILLAGER - (current % STREAK_DAYS_PER_VILLAGER)
  };
}

// ── Bangunan yang terbuka per level ──────────────────────────────────────────
// Ambangnya sama dengan pergantian gelar di levelTitle.
export const VILLAGE_UNLOCKS = [
  { key: "dermaga", level: 4, emoji: "⚓", name: "Dermaga", desc: "Perahu nelayan mulai singgah di pantai barat daya." },
  { key: "pasar", level: 8, emoji: "🧺", name: "Pasar", desc: "Lapak warna-warni buka di sebelah warung." },
  { key: "mercusuar", level: 15, emoji: "🗼", name: "Mercusuar", desc: "Cahayanya menyapu laut tiap senja." },
  { key: "pulau", level: 25, emoji: "🏝️", name: "Pulau kedua", desc: "Pulau kecil di seberang jembatan kayu." },
  { key: "balon", level: 40, emoji: "🎈", name: "Balon udara", desc: "Hadiah untuk Legenda Desa." }
] as const;

export type VillageUnlock = (typeof VILLAGE_UNLOCKS)[number];
export type UnlockKey = VillageUnlock["key"];

export function nextUnlock(level: number): VillageUnlock | null {
  return VILLAGE_UNLOCKS.find((u) => u.level > level) ?? null;
}

// ── Kejar deadline ───────────────────────────────────────────────────────────
export type PaceStatus = "none" | "done" | "ahead" | "ontrack" | "behind" | "overdue";

export interface GoalPace {
  status: PaceStatus;
  /** progres yang seharusnya sudah tercapai hari ini (0..1): garis lurus dari goal dibuat sampai target tanggal */
  expected: number;
  /** sisa hari sampai target tanggal; negatif = sudah lewat */
  daysLeft: number;
  /** masih di bawah garis jadwal, tapi setoran belakangan ini sudah cukup cepat (status "ontrack") */
  catchingUp: boolean;
  remaining: number;
  /** setoran per minggu / per bulan supaya selesai tepat waktu, dibulatkan ke atas ke Rp1.000 */
  perWeek: number;
  perMonth: number;
}

/** Selisih progres yang masih dianggap sesuai jadwal. */
const PACE_TOLERANCE = 0.05;
/** Jendela "setoran belakangan ini" untuk menilai apakah goal sedang mengejar. */
const RECENT_DAYS = 28;
const roundUpThousand = (n: number) => Math.ceil(n / 1000) * 1000;

/**
 * Telat = progres di bawah garis jadwal DAN setoran 28 hari terakhir belum secepat yang dibutuhkan.
 * Syarat kedua penting karena target tanggal bisa diatur belakangan (garisnya tetap dihitung dari
 * goal dibuat): goal lama yang setorannya sudah cukup kencang tidak langsung dicap telat.
 */
export function goalPace(
  goal: Pick<GoalView, "progress" | "saved" | "targetAmount" | "createdAt" | "deadline" | "contributions">,
  now = Date.now()
): GoalPace {
  const remaining = Math.max(0, goal.targetAmount - goal.saved);
  const idle = { expected: 0, daysLeft: 0, catchingUp: false, remaining, perWeek: 0, perMonth: 0 };
  if (goal.progress >= 1) return { ...idle, status: "done", expected: 1 };
  if (!goal.deadline) return { ...idle, status: "none" };

  const end = Date.parse(goal.deadline);
  const start = Date.parse(goal.createdAt);
  const daysLeft = wibDay(end) - wibDay(now);
  if (daysLeft < 0) {
    return { status: "overdue", expected: 1, daysLeft, catchingUp: false, remaining, perWeek: remaining, perMonth: remaining };
  }

  const expected = end > start ? Math.min(1, Math.max(0, (now - start) / (end - start))) : 1;
  // Hari target ikut dihitung: target besok = masih ada 2 hari untuk menyetor.
  const perDay = remaining / (daysLeft + 1);
  const recent = goal.contributions.reduce(
    (sum, c) => (now - Date.parse(c.date) <= RECENT_DAYS * DAY_MS ? sum + c.amount : sum),
    0
  );
  const belowLine = goal.progress + PACE_TOLERANCE < expected;
  const fastEnough = recent >= perDay * RECENT_DAYS;
  const status: PaceStatus =
    belowLine && !fastEnough ? "behind" : goal.progress >= expected + 0.1 ? "ahead" : "ontrack";
  return {
    status,
    expected,
    daysLeft,
    catchingUp: belowLine && fastEnough,
    remaining,
    perWeek: Math.min(remaining, roundUpThousand(perDay * 7)),
    perMonth: Math.min(remaining, roundUpThousand(perDay * 30))
  };
}

// ── Surat mingguan ───────────────────────────────────────────────────────────
/**
 * Pratinjau surat kalau insight mingguan belum ada, sama seperti "Preview bulan ini" di halaman
 * Laporan tepira. Kalimatnya port dari buildCyreneInsight (tepira/lib/report-scoring.ts); nama
 * pemilik diganti "-mu" karena desa dipakai banyak akun.
 */
export function previewInsight(summary: MonthSummary, debts: number) {
  const h = summary.health;
  const income = summary.income.total;
  const debtRatio = income > 0 ? Math.round((debts / income) * 1000) / 10 : debts > 0 ? 100 : 0;
  return {
    summary: `Cyrene melihat skor bulan ini ${h.score}/100 (${h.status}). Rasio tabungan ${summary.savingsRate}%, disiplin budget ${h.budgetDiscipline}%, runway sekitar ${h.runwayMonths} bulan, dan rasio kewajiban ${debtRatio}% dari pemasukan.`,
    recommendations: [
      summary.savingsRate >= 20
        ? "Tabungan sudah cantik; pertahankan minimal 20% supaya masa depanmu makin aman."
        : "Naikkan tabungan bertahap ke 10–20% pemasukan. Mulai dari nominal kecil yang konsisten.",
      h.budgetDiscipline >= 90
        ? "Budget masih disiplin. Jangan kasih celah ke pengeluaran impulsif kecil-kecil ya."
        : "Cek kategori yang paling bocor dan beri batas mingguan supaya alokasi gaji/bonus tidak jebol.",
      h.runwayMonths >= 3
        ? "Runway sudah nyaman. Berikutnya boleh fokus memperbesar goal penting."
        : "Dana darurat perlu diprioritaskan sampai minimal 3 bulan pengeluaran.",
      h.debtScore >= 80
        ? "Utang/kewajiban masih sehat. Tetap bayar tepat waktu dan hindari cicilan baru dulu."
        : "Kurangi kewajiban aktif dulu sebelum menambah goal baru yang agresif."
    ]
  };
}
