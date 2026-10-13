import { expenseCategories, getCategoryLabel } from "@/lib/categories";
import type { ExpenseView, GoalView, MonthSummary, SalaryView } from "@/lib/game";
import { categoryColor, categoryIcon, shortCategory } from "@/lib/places";

/**
 * Kanvas aliran uang: uang satu bulan digambar sebagai sungai. Mata air (gaji, bonus) mengisi
 * waduk desa, lalu waduk mengalirkannya ke kategori pengeluaran, ke goal, ke tabungan yang
 * disisihkan, dan yang belum terpakai tetap tinggal di waduk.
 *
 * - Tabungan tidak dihitung dobel: setoran ke goal dianggap diambil dari alokasi tabungan gaji
 *   dulu. Yang dialirkan ke tabungan = max(alokasi, setoran); kalau alokasinya lebih besar,
 *   selisihnya tampil sebagai "Disisihkan" (belum disetor ke goal mana pun).
 * - Kalau yang keluar lebih besar dari pemasukan, selisihnya datang dari mata air "Dari saldo
 *   dompet". Saldo awal bukan pemasukan (sama dengan Laporan tepira), jadi tidak ikut mengalir.
 * - "Belum terpakai" = pemasukan − pengeluaran − tabungan; beda dengan "Sisa budget" di HUD
 *   (jatah belanja − pengeluaran).
 */

export type FlowKind = "gaji" | "bonus" | "dompet" | "spend" | "goal" | "sisih" | "sisa";
export type FlowGroup = "masuk" | "pakai" | "tabung" | "sisa";

export interface FlowItem {
  key: string;
  kind: FlowKind;
  group: FlowGroup;
  label: string;
  icon: string;
  color: string;
  amount: number;
  /** jatah alokasi gaji kategori ini; null = tidak dijatah (atau bukan kategori) */
  budget: number | null;
  /** bagian pengeluaran bersumber gaji (yang dibandingkan dengan jatah, sama seperti panel Gaji) */
  fromSalary: number;
  /** jumlah catatan pengeluaran */
  count: number;
  goalId: number | null;
}

export interface MoneyFlow {
  sources: FlowItem[];
  /** urut: pengeluaran (terbesar dulu), tabungan (goal terbesar dulu, lalu disisihkan), belum terpakai */
  outs: FlowItem[];
  income: number;
  spent: number;
  /** setoran ke goal + alokasi yang disisihkan */
  saved: number;
  /** pemasukan yang belum dipakai/ditabung */
  rest: number;
  /** yang keluar melebihi pemasukan (ditutup dari saldo dompet) */
  deficit: number;
  /** = jumlah sumber = jumlah tujuan */
  total: number;
}

export interface FlowInput {
  summary: Pick<MonthSummary, "income" | "savedThisMonth" | "savingsAllocation" | "savedByGoal">;
  expenses: readonly Pick<ExpenseView, "amount" | "category" | "source">[];
  goals: readonly Pick<GoalView, "id" | "title">[];
  salary: Pick<SalaryView, "allocations"> | null;
  /** warna pita goal (mis. warna atap bangunannya); kosong = hijau tabungan */
  goalColor?: (goalId: number) => string;
}

/** Warna air sungai & waduk (sama dengan kolam di pulau). */
export const WATER = "#8fd3f4";
const GOAL_COLOR = "#2fb57d";
const SISIH_COLOR = "#6cc8ad";
const SISA_COLOR = "#7cc6e8";
const DOMPET_COLOR = "#f3b562";
const OTHER_COLOR = "#e9c46a";
/** Goal yang ditampilkan sendiri-sendiri; sisanya digabung. */
export const MAX_GOAL_STREAMS = 5;

/** Nominal dari baris lama tepira bisa saja aneh; yang tidak positif diabaikan. */
const pos = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
/** Label kategori seperti panel Gaji: key lama ("makan_harian") diterjemahkan, kosong = "Lainnya". */
const labelOf = (category: string | null) => (category?.trim() ? getCategoryLabel(category.trim()) : "") || "Lainnya";

export function buildMoneyFlow({ summary, expenses, goals, salary, goalColor }: FlowInput): MoneyFlow {
  const known = new Set<string>(expenseCategories.map((c) => c.label));
  const budgets = new Map<string, number>();
  for (const a of salary?.allocations ?? []) {
    const label = labelOf(a.category);
    budgets.set(label, (budgets.get(label) ?? 0) + pos(a.amount));
  }

  const byLabel = new Map<string, { amount: number; fromSalary: number; count: number }>();
  for (const e of expenses) {
    const amount = pos(e.amount);
    if (!amount) continue;
    const label = labelOf(e.category);
    const cur = byLabel.get(label) ?? { amount: 0, fromSalary: 0, count: 0 };
    cur.amount += amount;
    if (e.source !== "bonus") cur.fromSalary += amount;
    cur.count++;
    byLabel.set(label, cur);
  }

  const item = (
    key: string,
    kind: FlowKind,
    group: FlowGroup,
    label: string,
    icon: string,
    color: string,
    amount: number
  ): FlowItem => ({ key, kind, group, label, icon, color, amount, budget: null, fromSalary: 0, count: 0, goalId: null });

  const spends: FlowItem[] = [...byLabel]
    .sort((a, b) => b[1].amount - a[1].amount || a[0].localeCompare(b[0]))
    .map(([label, v]) => {
      const isKnown = known.has(label);
      const budget = budgets.get(label) ?? 0;
      return {
        ...item(
          `cat:${label}`,
          "spend",
          "pakai",
          isKnown ? shortCategory(label) : label,
          isKnown ? categoryIcon(label) : "🧾",
          isKnown ? categoryColor(label) : OTHER_COLOR,
          v.amount
        ),
        // Form gaji menyimpan semua kategori, termasuk yang jatahnya 0: itu sama dengan tidak dijatah.
        budget: budget > 0 ? budget : null,
        fromSalary: v.fromSalary,
        count: v.count
      };
    });
  const spent = spends.reduce((s, i) => s + i.amount, 0);

  const titles = new Map(goals.map((g) => [g.id, g.title]));
  const deposits = summary.savedByGoal
    .map((g) => ({ goalId: g.goalId, amount: pos(g.amount) }))
    .filter((g) => g.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.goalId - b.goalId);
  const shown = deposits.slice(0, MAX_GOAL_STREAMS);
  const saves: FlowItem[] = shown.map((g) => ({
    ...item(`goal:${g.goalId}`, "goal", "tabung", titles.get(g.goalId) ?? "Goal", "🏡", goalColor?.(g.goalId) ?? GOAL_COLOR, g.amount),
    goalId: g.goalId
  }));
  const shownTotal = shown.reduce((s, g) => s + g.amount, 0);
  // Goal yang tidak muat + setoran yang tidak terbagi per goal.
  const otherGoals = Math.max(0, pos(summary.savedThisMonth) - shownTotal);
  if (otherGoals > 0) {
    const label = deposits.length > shown.length ? `Goal lain (${deposits.length - shown.length})` : "Setoran lain";
    saves.push(item("goal:lain", "goal", "tabung", label, "🏡", GOAL_COLOR, otherGoals));
  }
  const deposited = Math.max(pos(summary.savedThisMonth), shownTotal);
  const sisih = Math.max(0, pos(summary.savingsAllocation) - deposited);
  if (sisih > 0) saves.push(item("sisih", "sisih", "tabung", "Disisihkan", "🐷", SISIH_COLOR, sisih));
  const saved = deposited + sisih;

  const salaryIn = pos(summary.income.salary);
  const bonusIn = pos(summary.income.bonus);
  const income = salaryIn + bonusIn;
  const out = spent + saved;
  const deficit = Math.max(0, out - income);
  const rest = Math.max(0, income - out);

  const sources: FlowItem[] = [];
  if (salaryIn > 0) sources.push(item("gaji", "gaji", "masuk", "Gaji", "💰", WATER, salaryIn));
  if (bonusIn > 0) sources.push(item("bonus", "bonus", "masuk", "Bonus", "🎁", WATER, bonusIn));
  if (deficit > 0) sources.push(item("dompet", "dompet", "masuk", "Dari saldo dompet", "🏺", DOMPET_COLOR, deficit));

  const outs = [...spends, ...saves];
  if (rest > 0) outs.push(item("sisa", "sisa", "sisa", "Belum terpakai", "💧", SISA_COLOR, rest));

  return { sources, outs, income, spent, saved, rest, deficit, total: income + deficit };
}

/** Kategori yang meluap: bagian bersumber gaji melewati jatah alokasi gaji (sama seperti panel Gaji). */
export function overflowing(item: FlowItem) {
  return item.budget !== null && item.fromSalary > item.budget;
}

/** Berapa yang meluap dari jatah (0 kalau tidak meluap). */
export function overflowBy(item: FlowItem) {
  return item.budget !== null ? Math.max(0, item.fromSalary - item.budget) : 0;
}

// ── Tata letak ───────────────────────────────────────────────────────────────

export interface FlowBox {
  item: FlowItem;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FlowLink {
  key: string;
  /** path pita air (bezier tertutup) */
  d: string;
  /** garis tengah untuk animasi arus */
  center: string;
  thickness: number;
  color: string;
  from: string;
  to: string;
}

export interface FlowLayout {
  width: number;
  height: number;
  sources: FlowBox[];
  pool: { x: number; y: number; w: number; h: number };
  outs: FlowBox[];
  links: FlowLink[];
}

const PAD = 18;
const NODE_W = 14;
/** tinggi baris minimal tiap tujuan supaya label dua barisnya tidak bertumpuk */
const ROW = 42;
const SOURCE_ROW = 52;
const GROUP_GAP = 18;
const MIN_T = 2;
/** ruang label di kanan tujuan */
export const LABEL_W = 130;

const r1 = (n: number) => Math.round(n * 10) / 10;

function ribbon(x0: number, y0: number, x1: number, y1: number, t: number) {
  const xm = (x0 + x1) / 2;
  const top = `M${r1(x0)},${r1(y0)} C${r1(xm)},${r1(y0)} ${r1(xm)},${r1(y1)} ${r1(x1)},${r1(y1)}`;
  const bottom = `L${r1(x1)},${r1(y1 + t)} C${r1(xm)},${r1(y1 + t)} ${r1(xm)},${r1(y0 + t)} ${r1(x0)},${r1(y0 + t)} Z`;
  const c0 = y0 + t / 2;
  const c1 = y1 + t / 2;
  return {
    d: `${top} ${bottom}`,
    center: `M${r1(x0)},${r1(c0)} C${r1(xm)},${r1(c0)} ${r1(xm)},${r1(c1)} ${r1(x1)},${r1(c1)}`
  };
}

/**
 * Posisi semua node & pita untuk lebar tertentu. Tinggi mengikuti jumlah tujuan (tiap tujuan
 * minimal satu baris label); ketebalan pita ∝ nominal dengan skala yang sama di kedua sisi waduk.
 */
export function layoutFlow(flow: MoneyFlow, width: number): FlowLayout {
  const w = Math.max(300, width);
  const groups = new Set(flow.outs.map((o) => o.group)).size;
  const gaps = Math.max(0, groups - 1) * GROUP_GAP;
  const base = Math.max(320, flow.outs.length * ROW + gaps + PAD * 2, flow.sources.length * SOURCE_ROW + PAD * 2);

  // Waduk setinggi ±55% area, pita dihitung dari situ.
  const poolTarget = Math.min(340, Math.max(110, (base - PAD * 2) * 0.55));
  const k = flow.total > 0 ? poolTarget / flow.total : 0;
  const thick = (amount: number) => Math.max(MIN_T, amount * k);
  // Pita yang tebal butuh baris lebih tinggi dari ROW: kanvas ikut memanjang.
  const outSlot = (amount: number) => Math.max(ROW, thick(amount) + 10);
  const sourceSlot = (amount: number) => Math.max(SOURCE_ROW, thick(amount) + 14);
  const rowsHeight = flow.outs.reduce((s, o) => s + outSlot(o.amount), 0) + gaps;
  const sourcesHeight = flow.sources.reduce((s, o) => s + sourceSlot(o.amount), 0);
  const height = Math.round(Math.max(base, rowsHeight + PAD * 2, sourcesHeight + PAD * 2));
  const inner = height - PAD * 2;

  // Kolom: label sumber di kiri, waduk di tengah, tujuan + labelnya di kanan.
  // Label sumber terpanjang ("🏺 Dari saldo…", ±90 px) rata kanan di sourceX − 8: jangan sampai terpotong.
  const sourceX = Math.min(130, Math.max(96, w * 0.2));
  const outX = Math.min(w - LABEL_W, Math.max(sourceX + 100, w * 0.6));
  const poolW = Math.min(46, Math.max(24, w * 0.05));
  const poolX = sourceX + NODE_W + (outX - sourceX - NODE_W - poolW) * 0.45;

  const outT = flow.outs.map((o) => thick(o.amount));
  const srcT = flow.sources.map((s) => thick(s.amount));
  const poolH = Math.max(outT.reduce((a, b) => a + b, 0), srcT.reduce((a, b) => a + b, 0), MIN_T);
  const poolY = PAD + (inner - poolH) / 2;

  // Tujuan: tiap baris ROW tinggi (atau setebal pitanya), dikelompokkan dengan jarak antar-kelompok.
  const outs: FlowBox[] = [];
  let y = PAD + Math.max(0, (inner - rowsHeight) / 2);
  flow.outs.forEach((item, i) => {
    if (i > 0 && flow.outs[i - 1].group !== item.group) y += GROUP_GAP;
    const slot = outSlot(item.amount);
    outs.push({ item, x: outX, y: y + (slot - outT[i]) / 2, w: NODE_W, h: outT[i] });
    y += slot;
  });

  // Sumber: dipusatkan secara vertikal terhadap waduk.
  const srcSlots = flow.sources.map((s) => sourceSlot(s.amount));
  let sy = PAD + (inner - sourcesHeight) / 2;
  const sources: FlowBox[] = flow.sources.map((item, i) => {
    const box = { item, x: sourceX, y: sy + (srcSlots[i] - srcT[i]) / 2, w: NODE_W, h: srcT[i] };
    sy += srcSlots[i];
    return box;
  });

  const links: FlowLink[] = [];
  // Pita masuk menumpuk di sisi kiri waduk, dipusatkan kalau totalnya lebih tipis dari waduk.
  let inY = poolY + (poolH - srcT.reduce((a, b) => a + b, 0)) / 2;
  sources.forEach((s) => {
    const r = ribbon(s.x + s.w, s.y, poolX, inY, s.h);
    links.push({ key: `in:${s.item.key}`, ...r, thickness: s.h, color: s.item.color, from: s.item.key, to: "pool" });
    inY += s.h;
  });
  let outY = poolY + (poolH - outT.reduce((a, b) => a + b, 0)) / 2;
  outs.forEach((o) => {
    const r = ribbon(poolX + poolW, outY, o.x, o.y, o.h);
    links.push({ key: `out:${o.item.key}`, ...r, thickness: o.h, color: o.item.color, from: "pool", to: o.item.key });
    outY += o.h;
  });

  return { width: w, height, sources, pool: { x: poolX, y: poolY, w: poolW, h: poolH }, outs, links };
}
