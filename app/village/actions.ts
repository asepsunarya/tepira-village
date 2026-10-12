"use server";

import { prisma } from "@/lib/prisma";
import { auth, signOut, userOwnedWhere } from "@/lib/auth";
import { buildSnapshot, normalizePeriod } from "@/lib/snapshot";
import {
  createExpenseWithWallet,
  deleteExpenseAndRestoreWallet,
  updateExpenseWithWallet,
  type ExpensePlace
} from "@/lib/wallet-expenses";
import { KNOWN_CATEGORY_LABELS, expenseCategories } from "@/lib/categories";
import { roundCoord } from "@/lib/places";
import type { ActionResult } from "@/lib/game";

/**
 * Semua server action menulis ke database tepira dengan aturan yang sama
 * persis seperti server actions / API routes di repo tepira, lalu
 * mengembalikan snapshot terbaru supaya desa langsung ter-update dalam
 * satu kali perjalanan ke server.
 */

type Period = { month: number; year: number };

async function requireUserId() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Sesi habis. Silakan login lagi.");
  return userId;
}

async function run(period: Period, fn: (userId: string) => Promise<void>): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await fn(userId);
    const { month, year } = normalizePeriod(period.month, period.year);
    return { ok: true, snapshot: await buildSnapshot(userId, month, year) };
  } catch (error) {
    console.error("[village action]", error);
    return { ok: false, message: error instanceof Error ? error.message : "Terjadi kesalahan." };
  }
}

const toInt = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
};
const clean = (v: unknown) => String(v ?? "").trim();

/** Kolom nominal di skema tepira bertipe Int (32-bit). */
const MAX_AMOUNT = 2_147_483_647;
function assertAmount(amount: number, label = "Nominal") {
  if (amount <= 0) throw new Error(`${label} harus lebih dari 0.`);
  if (amount > MAX_AMOUNT) throw new Error(`${label} terlalu besar (maksimal Rp2.147.483.647).`);
}

export async function fetchSnapshot(period: Period): Promise<ActionResult> {
  return run(period, async () => {});
}

// ── Goal & setoran ───────────────────────────────────────────────────────────

export async function createGoal(
  input: { title: string; description?: string; targetAmount: number; deadline?: string },
  period: Period
): Promise<ActionResult> {
  return run(period, async (userId) => {
    const title = clean(input.title);
    const targetAmount = toInt(input.targetAmount);
    if (!title) throw new Error("Nama goal harus diisi.");
    assertAmount(targetAmount, "Target");
    const deadline = clean(input.deadline);
    await prisma.goal.create({
      data: {
        title,
        description: clean(input.description) || null,
        targetAmount,
        deadline: deadline ? new Date(deadline) : null,
        userId
      }
    });
  });
}

/**
 * Target tanggal goal. tepira hanya mengisinya saat goal dibuat; desa membolehkan mengatur atau
 * menghapusnya belakangan supaya goal lama juga bisa dihitung "kejar deadline"-nya.
 */
export async function updateGoalDeadline(goalId: number, deadline: string | null, period: Period): Promise<ActionResult> {
  return run(period, async (userId) => {
    const raw = clean(deadline);
    const date = raw ? new Date(raw) : null;
    if (raw && (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(date!.getTime()))) {
      throw new Error("Format tanggal tidak valid.");
    }
    const { count } = await prisma.goal.updateMany({
      where: { id: toInt(goalId), ...userOwnedWhere(userId) },
      data: { deadline: date }
    });
    if (!count) throw new Error("Goal tidak ditemukan.");
  });
}

export async function deleteGoal(goalId: number, period: Period): Promise<ActionResult> {
  return run(period, async (userId) => {
    if (!goalId) return;
    await prisma.goal.deleteMany({ where: { id: goalId, ...userOwnedWhere(userId) } });
  });
}

export async function addContribution(
  input: { goalId: number; amount: number; note?: string },
  period: Period
): Promise<ActionResult> {
  return run(period, async (userId) => {
    const goalId = toInt(input.goalId);
    const amount = toInt(input.amount);
    if (!goalId) throw new Error("Goal wajib dipilih.");
    assertAmount(amount);
    const goal = await prisma.goal.findFirst({ where: { id: goalId, ...userOwnedWhere(userId) } });
    if (!goal) throw new Error("Goal tidak ditemukan.");
    await prisma.contribution.create({ data: { goalId, amount, note: clean(input.note) || null } });
    // Sama seperti tepira: klaim goal lama tanpa pemilik.
    if (!goal.userId) await prisma.goal.update({ where: { id: goalId }, data: { userId } });
  });
}

export async function deleteContribution(contributionId: number, period: Period): Promise<ActionResult> {
  return run(period, async (userId) => {
    if (!contributionId) return;
    await prisma.contribution.deleteMany({
      where: { id: contributionId, goal: userOwnedWhere(userId) }
    });
  });
}

export async function updateContribution(
  contributionId: number,
  input: { amount: number; note?: string; date?: string },
  period: Period
): Promise<ActionResult> {
  return run(period, async (userId) => {
    const amount = toInt(input.amount);
    assertAmount(amount);
    const dateRaw = clean(input.date);
    const { count } = await prisma.contribution.updateMany({
      where: { id: contributionId, goal: userOwnedWhere(userId) },
      data: { amount, note: clean(input.note) || null, ...(dateRaw ? { date: new Date(dateRaw) } : {}) }
    });
    if (!count) throw new Error("Setoran tidak ditemukan.");
  });
}

// ── Pengeluaran ──────────────────────────────────────────────────────────────

type PlaceInput = { name?: string | null; lat?: number | null; lng?: number | null } | null;

/**
 * Lokasi opsional (peta jajan). undefined = tidak disentuh (saat edit), null = dihapus. Titik hanya
 * disimpan kalau lintang & bujurnya sama-sama valid; nama boleh tanpa titik.
 */
function parsePlace(input: PlaceInput | undefined): ExpensePlace | undefined {
  if (input === undefined) return undefined;
  const placeName = clean(input?.name).slice(0, 120) || null;
  const lat = input?.lat == null ? Number.NaN : Number(input.lat);
  const lng = input?.lng == null ? Number.NaN : Number(input.lng);
  const valid = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return { placeName, latitude: valid ? roundCoord(lat) : null, longitude: valid ? roundCoord(lng) : null };
}

export async function addExpense(
  input: {
    amount: number;
    category?: string;
    note?: string;
    source?: string;
    date?: string;
    walletId: number;
    place?: PlaceInput;
  },
  period: Period
): Promise<ActionResult> {
  return run(period, async (userId) => {
    const amount = toInt(input.amount);
    const walletId = toInt(input.walletId);
    const source = clean(input.source) || "gaji";
    assertAmount(amount);
    if (source !== "gaji" && source !== "bonus") throw new Error("Sumber harus 'gaji' atau 'bonus'.");
    if (!walletId) throw new Error("Dompet wajib dipilih.");
    const dateRaw = clean(input.date);
    await createExpenseWithWallet(userId, {
      amount,
      category: clean(input.category) || null,
      note: clean(input.note) || null,
      source,
      date: dateRaw ? new Date(dateRaw) : new Date(),
      walletId,
      place: parsePlace(input.place)
    });
  });
}

export async function updateExpense(
  expenseId: number,
  input: Parameters<typeof addExpense>[0],
  period: Period
): Promise<ActionResult> {
  return run(period, async (userId) => {
    const amount = toInt(input.amount);
    const walletId = toInt(input.walletId);
    const source = clean(input.source) || "gaji";
    assertAmount(amount);
    if (source !== "gaji" && source !== "bonus") throw new Error("Sumber harus 'gaji' atau 'bonus'.");
    if (!walletId) throw new Error("Dompet wajib dipilih.");
    const dateRaw = clean(input.date);
    await updateExpenseWithWallet(userId, toInt(expenseId), {
      amount,
      category: clean(input.category) || null,
      note: clean(input.note) || null,
      source,
      // Kosong = tanggal lama dipertahankan (termasuk jam aslinya).
      date: dateRaw ? new Date(dateRaw) : undefined,
      walletId,
      place: parsePlace(input.place)
    });
  });
}

export async function deleteExpense(expenseId: number, period: Period): Promise<ActionResult> {
  return run(period, async (userId) => {
    if (!expenseId) return;
    await deleteExpenseAndRestoreWallet(userId, expenseId);
  });
}

// ── Dompet ───────────────────────────────────────────────────────────────────

const WALLET_TYPES = new Set(["bank", "e-wallet", "cash", "investment", "credit", "paylater", "other"]);

function parseWallet(input: {
  name: string;
  type?: string;
  balance: number;
  description?: string;
  isDebt?: boolean;
  sortOrder?: number;
}) {
  const name = clean(input.name);
  const typeRaw = clean(input.type) || "bank";
  const type = WALLET_TYPES.has(typeRaw) ? typeRaw : "other";
  const balance = toInt(input.balance);
  const isDebt = Boolean(input.isDebt) || type === "credit" || type === "paylater";
  if (!name) throw new Error("Nama dompet harus diisi.");
  return {
    name,
    type,
    balance,
    description: clean(input.description) || null,
    isDebt,
    sortOrder: toInt(input.sortOrder)
  };
}

export async function createWallet(
  input: Parameters<typeof parseWallet>[0],
  period: Period
): Promise<ActionResult> {
  return run(period, async (userId) => {
    const data = parseWallet(input);
    await prisma.wallet.create({ data: { ...data, userId } });
  });
}

export async function updateWallet(
  walletId: number,
  input: Parameters<typeof parseWallet>[0],
  period: Period
): Promise<ActionResult> {
  return run(period, async (userId) => {
    const data = parseWallet(input);
    await prisma.wallet.updateMany({ where: { id: walletId, ...userOwnedWhere(userId) }, data });
  });
}

export async function deleteWallet(walletId: number, period: Period): Promise<ActionResult> {
  return run(period, async (userId) => {
    if (!walletId) return;
    await prisma.wallet.deleteMany({ where: { id: walletId, ...userOwnedWhere(userId) } });
  });
}

// ── Alokasi gaji ─────────────────────────────────────────────────────────────

/** Nominal alokasi: bulat, 0 boleh (kategori tanpa jatah). */
function allocationAmount(v: unknown, label: string) {
  const n = Number(v ?? 0);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${label} harus angka bulat 0 atau lebih.`);
  if (n > MAX_AMOUNT) throw new Error(`${label} terlalu besar (maksimal Rp2.147.483.647).`);
  return n;
}

/**
 * Sama seperti createSalaryBudget di tepira: total pengeluaran + tabungan harus
 * pas dengan gaji, baris bulan ini di-update (klaim baris lama tanpa pemilik)
 * atau dibuat baru, dan breakdown kategori diganti seluruhnya.
 */
export async function saveSalaryAllocation(
  input: { amount: number; savingsAllocation: number; allocations: { category: string; amount: number }[] },
  period: Period
): Promise<ActionResult> {
  return run(period, async (userId) => {
    const { month, year } = normalizePeriod(period.month, period.year);
    const amount = toInt(input.amount);
    assertAmount(amount, "Gaji");
    const savingsAllocation = allocationAmount(input.savingsAllocation, "Alokasi tabungan");

    const list = Array.isArray(input.allocations) ? input.allocations : [];
    if (list.length > 60) throw new Error("Kategori alokasi terlalu banyak.");
    const byCategory = new Map<string, number>();
    for (const a of list) {
      const category = clean(a?.category);
      if (!category) throw new Error("Nama kategori alokasi tidak boleh kosong.");
      if (category.length > 120) throw new Error("Nama kategori alokasi terlalu panjang.");
      if (byCategory.has(category)) throw new Error(`Kategori "${category}" muncul lebih dari sekali.`);
      byCategory.set(category, allocationAmount(a?.amount, `Alokasi ${category}`));
    }

    // Sembilan kategori tepira selalu disimpan (nol pun, seperti /api/budget), lalu
    // kategori lain/lama yang masih punya nominal supaya tidak hilang diam-diam.
    const allocations = [
      ...expenseCategories.map((c) => ({ category: c.label, amount: byCategory.get(c.label) ?? 0 })),
      ...[...byCategory]
        .filter(([category, value]) => !KNOWN_CATEGORY_LABELS.has(category) && value > 0)
        .map(([category, value]) => ({ category, amount: value }))
    ];
    const totalExpenseAllocation = allocations.reduce((sum, a) => sum + a.amount, 0);
    const totalAllocated = totalExpenseAllocation + savingsAllocation;
    if (totalAllocated !== amount) {
      throw new Error(
        `Total alokasi (${totalAllocated.toLocaleString("id-ID")}) harus sama dengan gaji (${amount.toLocaleString("id-ID")})`
      );
    }

    const existing = await prisma.salary.findFirst({
      where: { month, year, ...userOwnedWhere(userId) },
      // Utamakan baris milik user kalau ada juga baris lama tanpa pemilik (hindari bentrok unique).
      orderBy: { userId: { sort: "asc", nulls: "last" } }
    });
    if (existing) {
      await prisma.salary.update({
        where: { id: existing.id },
        data: {
          amount,
          totalExpenseAllocation,
          savingsAllocation,
          userId,
          allocations: { deleteMany: {}, create: allocations }
        }
      });
    } else {
      await prisma.salary.create({
        data: {
          amount,
          month,
          year,
          totalExpenseAllocation,
          savingsAllocation,
          userId,
          allocations: { create: allocations }
        }
      });
    }
  });
}

/**
 * Sama seperti deleteSalary di tepira: hapus satu baris berdasarkan id (baris yang sedang
 * dilihat), bukan semua baris bulan itu. Bulan & tahun ikut dicek supaya id basi tidak
 * menghapus bulan lain.
 */
export async function deleteSalaryAllocation(salaryId: number, period: Period): Promise<ActionResult> {
  return run(period, async (userId) => {
    if (!Number.isInteger(salaryId) || salaryId <= 0) throw new Error("Alokasi gaji tidak ditemukan.");
    const { month, year } = normalizePeriod(period.month, period.year);
    const { count } = await prisma.salary.deleteMany({
      where: { id: salaryId, month, year, ...userOwnedWhere(userId) }
    });
    if (!count) throw new Error("Alokasi gaji ini sudah berubah atau terhapus. Muat ulang halaman dulu, ya.");
  });
}

// ── Lain-lain ────────────────────────────────────────────────────────────────

/** Sama seperti tepira: PIN dibandingkan dengan APP_PIN di environment. */
export async function verifyPin(pin: string): Promise<{ success: boolean }> {
  const correct = process.env.APP_PIN;
  if (!correct) return { success: true };
  return { success: clean(pin) === correct };
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
