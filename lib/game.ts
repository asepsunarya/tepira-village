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
