import { prisma } from "@/lib/prisma";
import { userOwnedWhere, isDevLoginEnabled } from "@/lib/auth";
import { healthStatusFor, type Snapshot } from "@/lib/game";

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

/**
 * Membaca semua data yang dibutuhkan desa dalam satu kali jalan.
 * Rumus skor kesehatan disalin dari tepira/lib/report-scoring.ts supaya angka
 * yang tampil di desa sama dengan halaman Laporan di tepira.
 */
export async function buildSnapshot(userId: string, month: number, year: number): Promise<Snapshot> {
  const ownerWhere = userOwnedWhere(userId);
  const { start, end } = monthRange(month, year);

  const [user, goals, wallets, expenses, salary, bonus, balance] = await Promise.all([
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
    prisma.salary.findFirst({ where: { month, year, ...ownerWhere }, include: { allocations: true } }),
    prisma.bonus.findFirst({ where: { month, year, ...ownerWhere }, include: { allocations: true } }),
    prisma.balance.findFirst({ where: { month, year, ...ownerWhere } })
  ]);

  const totalIncome = (salary?.amount || 0) + (bonus?.amount || 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  const allContributions = goals.flatMap((g) => g.contributions);
  const monthlyContributions = allContributions.filter((c) => c.date >= start && c.date < end);
  const savedThisMonth = monthlyContributions.reduce((s, c) => s + c.amount, 0);
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
      walletName: e.wallet?.name ?? null
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
    totals: {
      totalSaved,
      contributionCount: allContributions.length,
      assets: walletAssets,
      debts: walletDebts,
      netWorth: walletAssets - walletDebts
    },
    pinRequired: Boolean(process.env.APP_PIN),
    devLogin: isDevLoginEnabled,
    generatedAt: new Date().toISOString()
  };
}
