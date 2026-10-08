"use server";

import { prisma } from "@/lib/prisma";
import { auth, signOut, userOwnedWhere } from "@/lib/auth";
import { buildSnapshot, normalizePeriod } from "@/lib/snapshot";
import { createExpenseWithWallet, deleteExpenseAndRestoreWallet } from "@/lib/wallet-expenses";
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
    if (targetAmount <= 0) throw new Error("Target harus lebih dari 0.");
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
    if (!goalId || amount <= 0) throw new Error("Nominal harus lebih dari 0.");
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

// ── Pengeluaran ──────────────────────────────────────────────────────────────

export async function addExpense(
  input: {
    amount: number;
    category?: string;
    note?: string;
    source?: string;
    date?: string;
    walletId: number;
  },
  period: Period
): Promise<ActionResult> {
  return run(period, async (userId) => {
    const amount = toInt(input.amount);
    const walletId = toInt(input.walletId);
    const source = clean(input.source) || "gaji";
    if (amount <= 0) throw new Error("Nominal harus lebih dari 0.");
    if (source !== "gaji" && source !== "bonus") throw new Error("Sumber harus 'gaji' atau 'bonus'.");
    if (!walletId) throw new Error("Dompet wajib dipilih.");
    const dateRaw = clean(input.date);
    await createExpenseWithWallet(userId, {
      amount,
      category: clean(input.category) || null,
      note: clean(input.note) || null,
      source,
      date: dateRaw ? new Date(dateRaw) : new Date(),
      walletId
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
