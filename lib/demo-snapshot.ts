import { SALARY_TEMPLATE_75, expenseCategories, getCategoryLabel, type ExpenseCategoryKey } from "@/lib/categories";
import {
  healthStatusFor,
  wibDay,
  type ContributionView,
  type ExpenseView,
  type GoalView,
  type SalaryView,
  type Snapshot,
  type WalletView
} from "@/lib/game";

/**
 * Desa contoh untuk landing page. Semua angka fiktif dan TIDAK pernah dikirim ke server.
 * Email ini tidak mungkin milik user asli, jadi VillageApp selalu hidrasi ulang
 * kalau store masih memegang snapshot demo.
 */
export const DEMO_EMAIL = "demo@tepira.village";

export function isDemoSnapshot(snapshot: Snapshot | null | undefined) {
  return snapshot?.user.email === DEMO_EMAIL;
}

// [bulan lalu ke-n, tanggal, nominal, catatan]
type ContributionSeed = [monthsAgo: number, day: number, amount: number, note: string | null];

const GOALS: { title: string; description: string; target: number; createdMonthsAgo: number; seeds: ContributionSeed[] }[] = [
  {
    title: "Dana darurat",
    description: "3x pengeluaran bulanan, biar tidur nyenyak.",
    target: 15_000_000,
    createdMonthsAgo: 6,
    seeds: [
      [0, 9, 150_000, "Sisa uang jajan"],
      [0, 3, 250_000, null],
      [1, 25, 1_500_000, "Gajian"],
      [2, 25, 1_000_000, "Gajian"],
      [3, 25, 1_000_000, "Gajian"]
    ]
  },
  {
    title: "Laptop baru",
    description: "Buat kerja lepas di akhir pekan.",
    target: 12_000_000,
    createdMonthsAgo: 5,
    seeds: [
      [0, 6, 100_000, "Teu pira, tapi rutin"],
      [1, 26, 1_500_000, null],
      [2, 26, 2_500_000, null],
      [3, 26, 2_500_000, null],
      [4, 26, 3_000_000, "Bonus project"]
    ]
  },
  {
    title: "Liburan ke Jogja",
    description: "Gudeg, Malioboro, dan sunrise di Punthuk Setumbu.",
    target: 3_000_000,
    createdMonthsAgo: 5,
    seeds: [
      [2, 15, 1_000_000, null],
      [3, 15, 1_000_000, null],
      [4, 15, 1_000_000, null]
    ]
  },
  {
    title: "Sepeda",
    description: "Sepeda lipat buat ke stasiun.",
    target: 4_500_000,
    createdMonthsAgo: 1,
    seeds: []
  }
];

const WALLETS: Omit<WalletView, "id" | "sortOrder" | "description">[] = [
  { name: "Rekening utama", type: "bank", balance: 5_200_000, isDebt: false },
  { name: "Dompet digital", type: "e-wallet", balance: 450_000, isDebt: false },
  { name: "Dompet tunai", type: "cash", balance: 185_000, isDebt: false },
  { name: "Kartu kredit", type: "credit", balance: 1_300_000, isDebt: true }
];

// [tanggal, kategori, nominal, catatan, indeks dompet]
const EXPENSES: [number, ExpenseCategoryKey, number, string, number][] = [
  [10, "makan_harian", 32_000, "Nasi padang", 2],
  [9, "nongkrong", 22_000, "Kopi sore", 1],
  [8, "transport", 18_000, "Ojek ke kantor", 1],
  [6, "makan_harian", 45_000, "Belanja sayur", 2],
  [4, "langganan", 55_000, "Musik streaming", 3],
  [3, "pulsa_internet", 105_000, "Paket data", 0],
  [2, "listrik_kos", 550_000, "Token listrik & air", 0]
];

/** Simulasi gaji Rp7,5 jt ala tepira (TEMPLATE_75): 60% kebutuhan & rutin, 40% tabungan. */
function demoSalary(id: number): SalaryView {
  const allocations = expenseCategories.map((c) => ({ category: c.label, amount: SALARY_TEMPLATE_75.allocations[c.key] }));
  return {
    id,
    amount: SALARY_TEMPLATE_75.salary,
    totalExpenseAllocation: allocations.reduce((s, a) => s + a.amount, 0),
    savingsAllocation: SALARY_TEMPLATE_75.savings,
    allocations
  };
}

/** Alokasi gaji contoh (dipakai juga untuk ilustrasi di landing). */
export const DEMO_SALARY = demoSalary(7001);

/** Hari tercatat desa contoh: streak 5 hari sampai hari ini + deret 14 hari bulan lalu (2 warga). */
function demoActivityDays(now: Date) {
  const today = wibDay(now.getTime());
  const days: number[] = [];
  for (let d = today - 30; d <= today - 17; d++) days.push(d);
  for (let d = today - 4; d <= today; d++) days.push(d);
  return days;
}

const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));

/** Hitung ulang ringkasan & skor dengan rumus yang sama seperti lib/snapshot.ts. */
function withDerived(base: Omit<Snapshot, "summary" | "totals">, period: { month: number; year: number }): Snapshot {
  const start = new Date(period.year, period.month - 1, 1).getTime();
  const end = new Date(period.year, period.month, 1).getTime();
  const salary = base.salary;
  const totalIncome = salary?.amount ?? 0;
  const totalExpenses = base.expenses.reduce((s, e) => s + e.amount, 0);

  const all = base.goals.flatMap((g) => g.contributions);
  const savedThisMonth = all
    .filter((c) => {
      const t = Date.parse(c.date);
      return t >= start && t < end;
    })
    .reduce((s, c) => s + c.amount, 0);
  const savedAmount = savedThisMonth + (salary?.savingsAllocation ?? 0);
  const savingsRate = totalIncome > 0 ? Math.round((savedAmount / totalIncome) * 1000) / 10 : 0;

  const budgetLimit = salary?.totalExpenseAllocation ?? 0;
  const budgetDiscipline =
    budgetLimit > 0 ? clamp(Math.round((1 - Math.max(0, totalExpenses - budgetLimit) / budgetLimit) * 100)) : 100;
  const assets = base.wallets.filter((w) => !w.isDebt).reduce((s, w) => s + w.balance, 0);
  const debts = base.wallets.filter((w) => w.isDebt).reduce((s, w) => s + Math.abs(w.balance), 0);
  const runwayMonths = totalExpenses > 0 ? Math.round((assets / totalExpenses) * 10) / 10 : 12;
  const runwayScore = clamp(Math.round((runwayMonths / 3) * 100));
  const debtRatio = totalIncome > 0 ? Math.round((debts / totalIncome) * 1000) / 10 : 0;
  const debtScore = debts === 0 ? 100 : clamp(Math.round(100 - debtRatio * 2));
  const savingScore = clamp(Math.round((savingsRate / 20) * 100));
  const score = Math.round(savingScore * 0.3 + budgetDiscipline * 0.25 + runwayScore * 0.25 + debtScore * 0.2);

  const byCategory: Record<string, number> = {};
  for (const e of base.expenses) {
    const key = e.category || "Lainnya";
    byCategory[key] = (byCategory[key] || 0) + e.amount;
  }

  return {
    ...base,
    summary: {
      month: period.month,
      year: period.year,
      startingBalance: 0,
      income: { salary: totalIncome, bonus: 0, total: totalIncome },
      savingsAllocation: salary?.savingsAllocation ?? 0,
      expenses: { total: totalExpenses, count: base.expenses.length },
      budget: {
        limit: budgetLimit,
        remaining: budgetLimit - totalExpenses,
        status: budgetLimit === 0 ? "NO_BUDGET" : totalExpenses > budgetLimit ? "OVER_BUDGET" : "WITHIN_BUDGET"
      },
      savedThisMonth,
      savingsRate,
      byCategory,
      health: {
        score,
        status: healthStatusFor(score),
        savingScore,
        budgetDiscipline,
        runwayMonths,
        runwayScore,
        debtScore
      }
    },
    totals: {
      totalSaved: all.reduce((s, c) => s + c.amount, 0),
      contributionCount: all.length,
      assets,
      debts,
      netWorth: assets - debts
    }
  };
}

/** Snapshot desa contoh untuk bulan berjalan: 4 goal di tahap berbeda, 4 dompet (1 utang), skor sehat. */
export function createDemoSnapshot(now = new Date()): Snapshot {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const today = now.getDate();
  // Tanggal bulan ini dibatasi sampai hari ini supaya tidak ada transaksi "masa depan".
  const at = (monthsAgo: number, day: number) =>
    new Date(year, month - 1 - monthsAgo, monthsAgo === 0 ? Math.min(day, today) : day, 10).toISOString();

  let contributionId = 5001;
  const goals: GoalView[] = GOALS.map((g, i) => {
    const contributions: ContributionView[] = g.seeds.map(([monthsAgo, day, amount, note]) => ({
      id: contributionId++,
      amount,
      note,
      date: at(monthsAgo, day)
    }));
    const saved = contributions.reduce((s, c) => s + c.amount, 0);
    return {
      id: 1001 + i,
      title: g.title,
      description: g.description,
      targetAmount: g.target,
      deadline: null,
      createdAt: at(g.createdMonthsAgo, 1 + i),
      saved,
      progress: Math.min(1, saved / g.target),
      contributions
    };
  });

  const wallets: WalletView[] = WALLETS.map((w, i) => ({ ...w, id: 3001 + i, sortOrder: i, description: null }));

  const expenses: ExpenseView[] = EXPENSES.map(([day, key, amount, note, walletIndex], i) => ({
    id: 4001 + i,
    amount,
    category: getCategoryLabel(key),
    note,
    source: "gaji",
    date: at(0, day),
    walletId: wallets[walletIndex].id,
    walletName: wallets[walletIndex].name,
    placeName: null,
    latitude: null,
    longitude: null
  }));

  const prev = new Date(year, month - 2, 1);
  return withDerived(
    {
      user: { name: "Warga Demo", email: DEMO_EMAIL, image: null },
      period: { month, year },
      goals,
      wallets,
      expenses,
      salary: DEMO_SALARY,
      previousSalary: { ...demoSalary(7000), month: prev.getMonth() + 1, year: prev.getFullYear() },
      activityDays: demoActivityDays(now),
      insight: null,
      places: [],
      pinRequired: false,
      devLogin: false,
      generatedAt: now.toISOString()
    },
    { month, year }
  );
}

let demoContributionId = 900_001;

/** Setoran pura-pura untuk animasi landing: snapshot baru, tanpa menyentuh server. */
export function withDemoContribution(snapshot: Snapshot, goalId: number, amount: number, now = new Date()): Snapshot {
  const goals = snapshot.goals.map((g) => {
    if (g.id !== goalId) return g;
    const contribution: ContributionView = { id: demoContributionId++, amount, note: "Setoran demo", date: now.toISOString() };
    const saved = g.saved + amount;
    return {
      ...g,
      saved,
      progress: Math.min(1, saved / g.targetAmount),
      contributions: [contribution, ...g.contributions].slice(0, 30)
    };
  });
  return withDerived({ ...snapshot, goals }, snapshot.period);
}
