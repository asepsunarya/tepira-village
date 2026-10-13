import { prisma } from "@/lib/prisma";
import { userOwnedWhere, isDevLoginEnabled } from "@/lib/auth";
import { ACTIVITY_WINDOW_DAYS, DAY_MS, healthStatusFor, wibDay, type SalaryView, type Snapshot } from "@/lib/game";
import { knownPlacesFrom, normalizePlaceName } from "@/lib/places";
import { loadVillageSync } from "@/lib/village-state";

const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));

export function monthRange(month: number, year: number) {
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
}

export function normalizePeriod(month?: number, year?: number) {
  const now = new Date();
  const m = month && month >= 1 && month <= 12 ? Math.floor(month) : now.getMonth() + 1;
  const y = year && year >= 2000 && year <= 2100 ? Math.floor(year) : now.getFullYear();
  return { month: m, year: y };
}

function salaryView(s: {
  id: number;
  amount: number;
  totalExpenseAllocation: number;
  savingsAllocation: number;
  allocations: { category: string; amount: number }[];
}): SalaryView {
  return {
    id: s.id,
    amount: s.amount,
    totalExpenseAllocation: s.totalExpenseAllocation,
    savingsAllocation: s.savingsAllocation,
    allocations: s.allocations.map((a) => ({ category: a.category, amount: a.amount }))
  };
}

/** Akun dianggap baru selama ini sejak dibuat. */
const NEW_USER_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Pengguna baru untuk tur desa: akunnya baru DAN belum punya satu baris pun atas namanya.
 * Dihitung ketat per userId (baris lama tanpa pemilik tidak ikut, karena terlihat oleh semua
 * akun). Batas umur akun perlu karena pemilik data lama itu juga punya hitungan 0.
 * Setoran tidak dihitung terpisah: menyetor selalu mengklaim goal-nya.
 */
export async function isNewVillager(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      _count: { select: { goals: true, wallets: true, expenses: true, salaries: true, bonuses: true, balances: true } }
    }
  });
  if (!user || Date.now() - user.createdAt.getTime() > NEW_USER_WINDOW_MS) return false;
  return Object.values(user._count).every((n) => n === 0);
}

/**
 * Membaca semua data yang dibutuhkan desa dalam satu kali jalan.
 * Rumus skor kesehatan disalin dari tepira/lib/report-scoring.ts supaya angka
 * yang tampil di desa sama dengan halaman Laporan di tepira.
 */
export async function buildSnapshot(userId: string, month: number, year: number): Promise<Snapshot> {
  const ownerWhere = userOwnedWhere(userId);
  const { start, end } = monthRange(month, year);
  const activitySince = new Date(Date.now() - (ACTIVITY_WINDOW_DAYS + 1) * DAY_MS);
  const placesSince = new Date(Date.now() - 366 * DAY_MS);

  const [
    user,
    goals,
    wallets,
    expenses,
    salary,
    bonus,
    balance,
    previousSalary,
    activityExpenses,
    insight,
    placeRows,
    earlierPlaceRows,
    sync
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, image: true } }),
    prisma.goal.findMany({
      where: ownerWhere,
      include: { contributions: { orderBy: { date: "desc" } } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.wallet.findMany({ where: ownerWhere, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.expense.findMany({
      where: { date: { gte: start, lt: end }, ...ownerWhere },
      include: { wallet: { select: { name: true } } },
      orderBy: [{ date: "desc" }, { id: "desc" }]
    }),
    // Kalau ada baris lama (userId null) DAN baris milik user di bulan yang sama, pakai milik user
    // supaya yang tampil = yang diubah oleh saveSalaryAllocation.
    prisma.salary.findFirst({
      where: { month, year, ...ownerWhere },
      include: { allocations: { orderBy: { id: "asc" } } },
      orderBy: { userId: { sort: "asc", nulls: "last" } }
    }),
    prisma.bonus.findFirst({ where: { month, year, ...ownerWhere }, include: { allocations: true } }),
    prisma.balance.findFirst({ where: { month, year, ...ownerWhere } }),
    // Sumber "Salin dari bulan lalu" hanya baris milik user sendiri: baris lama tanpa pemilik
    // jangan ditawarkan ke akun baru.
    prisma.salary.findFirst({
      where: { userId, OR: [{ year: { lt: year } }, { year, month: { lt: month } }] },
      include: { allocations: { orderBy: { id: "asc" } } },
      orderBy: [{ year: "desc" }, { month: "desc" }]
    }),
    // Tanggal saja, untuk lampu streak & warga (computeStreak di lib/game.ts).
    prisma.expense.findMany({ where: { date: { gte: activitySince }, ...ownerWhere }, select: { date: true } }),
    // Surat mingguan: insight terbaru sampai bulan yang dilihat. Dibungkus AND supaya OR milik
    // userOwnedWhere tidak tertimpa OR periode.
    prisma.weeklyFinancialInsight.findFirst({
      where: { AND: [ownerWhere, { OR: [{ year: { lt: year } }, { year, month: { lte: month } }] }] },
      orderBy: { weekStart: "desc" }
    }),
    // Tempat jajan setahun terakhir untuk dipakai ulang (lihat knownPlacesFrom).
    prisma.expense.findMany({
      where: {
        ...ownerWhere,
        date: { gte: placesSince },
        placeName: { not: null },
        latitude: { not: null },
        longitude: { not: null }
      },
      select: { placeName: true, latitude: true, longitude: true },
      orderBy: { date: "desc" },
      take: 500
    }),
    // Nama tempat setahun sebelum bulan yang dilihat: tempat bulan ini yang tidak ada di sini
    // tampil sebagai "Pertama kali bulan ini" di peta jajan. groupBy (bukan findMany + distinct)
    // supaya pengelompokan & batasnya terjadi di database, bukan setelah semua baris diambil.
    prisma.expense.groupBy({
      by: ["placeName"],
      where: { ...ownerWhere, date: { gte: new Date(start.getTime() - 365 * DAY_MS), lt: start }, placeName: { not: null } },
      orderBy: { placeName: "asc" },
      take: 2000
    }),
    // Data desa yang sinkron antar perangkat. Tabelnya milik migrasi tepira: kalau belum ada,
    // hasilnya kosong + available:false (desa jalan dari localStorage), tidak melempar error.
    loadVillageSync(userId)
  ]);

  const totalIncome = (salary?.amount || 0) + (bonus?.amount || 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  const allContributions = goals.flatMap((g) => g.contributions);
  const monthlyContributions = allContributions.filter((c) => c.date >= start && c.date < end);
  const savedThisMonth = monthlyContributions.reduce((s, c) => s + c.amount, 0);
  const savedByGoal = goals
    .map((g) => ({
      goalId: g.id,
      amount: g.contributions.reduce((s, c) => (c.date >= start && c.date < end ? s + c.amount : s), 0)
    }))
    .filter((g) => g.amount > 0);
  const savedAmount = savedThisMonth + (salary?.savingsAllocation || 0);
  const savingsRate = totalIncome > 0 ? Math.round((savedAmount / totalIncome) * 1000) / 10 : 0;

  const bonusExpenseAllocation =
    bonus?.allocations.filter((a) => a.category !== "Tabungan").reduce((s, a) => s + a.amount, 0) || 0;
  const budgetLimit = (salary?.totalExpenseAllocation || 0) + bonusExpenseAllocation;
  const budgetDiscipline =
    budgetLimit > 0
      ? clamp(Math.round((1 - Math.max(0, totalExpenses - budgetLimit) / budgetLimit) * 100))
      : totalExpenses > 0
        ? 60
        : 100;

  const walletAssets = wallets.filter((w) => !w.isDebt).reduce((s, w) => s + w.balance, 0);
  const walletDebts = wallets.filter((w) => w.isDebt).reduce((s, w) => s + Math.abs(w.balance), 0);
  const runwayMonths =
    totalExpenses > 0 ? Math.round((walletAssets / totalExpenses) * 10) / 10 : walletAssets > 0 ? 12 : 0;
  const runwayScore = clamp(Math.round((runwayMonths / 3) * 100));
  const debtRatio =
    totalIncome > 0 ? Math.round((walletDebts / totalIncome) * 1000) / 10 : walletDebts > 0 ? 100 : 0;
  const debtScore = walletDebts === 0 ? 100 : clamp(Math.round(100 - debtRatio * 2));
  const savingScore = clamp(Math.round((savingsRate / 20) * 100));
  const healthScore = Math.round(
    savingScore * 0.3 + budgetDiscipline * 0.25 + runwayScore * 0.25 + debtScore * 0.2
  );

  const byCategory: Record<string, number> = {};
  for (const e of expenses) {
    const key = e.category || "Lainnya";
    byCategory[key] = (byCategory[key] || 0) + e.amount;
  }

  const totalSaved = allContributions.reduce((s, c) => s + c.amount, 0);

  const activity = new Set<number>();
  for (const e of activityExpenses) activity.add(wibDay(e.date));
  for (const c of allContributions) if (c.date >= activitySince) activity.add(wibDay(c.date));

  return {
    user: { name: user?.name ?? null, email: user?.email ?? null, image: user?.image ?? null },
    period: { month, year },
    goals: goals.map((g) => {
      const saved = g.contributions.reduce((s, c) => s + c.amount, 0);
      return {
        id: g.id,
        title: g.title,
        description: g.description,
        targetAmount: g.targetAmount,
        deadline: g.deadline ? g.deadline.toISOString() : null,
        createdAt: g.createdAt.toISOString(),
        saved,
        progress: g.targetAmount > 0 ? Math.min(1, saved / g.targetAmount) : 0,
        contributions: g.contributions.slice(0, 30).map((c) => ({
          id: c.id,
          amount: c.amount,
          note: c.note,
          date: c.date.toISOString()
        }))
      };
    }),
    wallets: wallets.map((w) => ({
      id: w.id,
      name: w.name,
      type: w.type,
      balance: w.balance,
      description: w.description,
      isDebt: w.isDebt,
      sortOrder: w.sortOrder
    })),
    expenses: expenses.map((e) => ({
      id: e.id,
      amount: e.amount,
      category: e.category,
      note: e.note,
      source: e.source || "gaji",
      date: e.date.toISOString(),
      walletId: e.walletId,
      walletName: e.wallet?.name ?? null,
      placeName: e.placeName,
      latitude: e.latitude,
      longitude: e.longitude
    })),
    summary: {
      month,
      year,
      startingBalance: balance?.amount || 0,
      income: { salary: salary?.amount || 0, bonus: bonus?.amount || 0, total: totalIncome },
      savingsAllocation: salary?.savingsAllocation || 0,
      expenses: { total: totalExpenses, count: expenses.length },
      budget: {
        limit: budgetLimit,
        remaining: budgetLimit - totalExpenses,
        status: budgetLimit === 0 ? "NO_BUDGET" : totalExpenses > budgetLimit ? "OVER_BUDGET" : "WITHIN_BUDGET"
      },
      savedThisMonth,
      savedByGoal,
      savingsRate,
      byCategory,
      health: {
        score: healthScore,
        status: healthStatusFor(healthScore),
        savingScore,
        budgetDiscipline,
        runwayMonths,
        runwayScore,
        debtScore
      }
    },
    salary: salary ? salaryView(salary) : null,
    previousSalary: previousSalary
      ? { ...salaryView(previousSalary), month: previousSalary.month, year: previousSalary.year }
      : null,
    activityDays: [...activity].sort((a, b) => a - b),
    insight: insight
      ? {
          id: insight.id,
          weekStart: insight.weekStart.toISOString(),
          weekEnd: insight.weekEnd.toISOString(),
          healthScore: insight.healthScore,
          status: insight.status,
          summary: insight.summary,
          // Sama seperti halaman Laporan tepira: JSON berisi daftar kalimat.
          recommendations: Array.isArray(insight.recommendations) ? insight.recommendations.map(String) : []
        }
      : null,
    places: knownPlacesFrom(placeRows),
    placesBefore: [...new Set(earlierPlaceRows.map((r) => normalizePlaceName(r.placeName ?? "")))].filter(Boolean),
    totals: {
      totalSaved,
      contributionCount: allContributions.length,
      assets: walletAssets,
      debts: walletDebts,
      netWorth: walletAssets - walletDebts
    },
    sync,
    pinRequired: Boolean(process.env.APP_PIN),
    devLogin: isDevLoginEnabled,
    generatedAt: new Date().toISOString()
  };
}
