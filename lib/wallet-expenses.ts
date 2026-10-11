import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { userOwnedWhere } from "@/lib/auth";

/**
 * Port 1:1 dari tepira/lib/wallet-expenses.ts.
 * Aturan saldo dompet HARUS sama persis dengan tepira supaya data konsisten
 * ketika kedua app menulis ke database yang sama.
 */
type Tx = Prisma.TransactionClient;

function applyExpenseToWalletBalance(currentBalance: number, isDebt: boolean, amount: number) {
  // Dompet aset (bank, cash, e-wallet) berkurang saat belanja.
  // Dompet utang (credit/paylater) bertambah karena yang terutang naik.
  return isDebt ? currentBalance + amount : currentBalance - amount;
}

function reverseExpenseFromWalletBalance(currentBalance: number, isDebt: boolean, amount: number) {
  return isDebt ? currentBalance - amount : currentBalance + amount;
}

async function resolveRequiredWallet(tx: Tx, userId: string, walletId: number) {
  const wallet = walletId
    ? await tx.wallet.findFirst({ where: { id: walletId, ...userOwnedWhere(userId) } })
    : null;
  if (!wallet) throw new Error("Dompet wajib dipilih dan harus milik user ini.");
  return wallet;
}

export async function createExpenseWithWallet(
  userId: string,
  data: {
    amount: number;
    category?: string | null;
    note?: string | null;
    source?: string | null;
    date?: Date;
    walletId: number;
  }
) {
  return prisma.$transaction(async (tx) => {
    const wallet = await resolveRequiredWallet(tx, userId, data.walletId);
    const expense = await tx.expense.create({
      data: {
        amount: data.amount,
        category: data.category || null,
        note: data.note || null,
        source: data.source || "gaji",
        date: data.date || new Date(),
        userId,
        walletId: wallet.id
      },
      include: { wallet: true }
    });
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: applyExpenseToWalletBalance(wallet.balance, wallet.isDebt, data.amount) }
    });
    return expense;
  });
}

export async function deleteExpenseAndRestoreWallet(userId: string, expenseId: number) {
  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.findFirst({
      where: { id: expenseId, ...userOwnedWhere(userId) },
      include: { wallet: true }
    });
    if (!expense) return null;
    await tx.expense.delete({ where: { id: expense.id } });
    if (expense.wallet) {
      await tx.wallet.update({
        where: { id: expense.wallet.id },
        data: {
          balance: reverseExpenseFromWalletBalance(
            expense.wallet.balance,
            expense.wallet.isDebt,
            expense.amount
          )
        }
      });
    }
    return expense;
  });
}

/**
 * Tidak ada padanannya di tepira (tepira belum punya edit pengeluaran).
 * Aturannya disusun dari dua fungsi di atas supaya tetap konsisten:
 * efek pengeluaran lama dibalik di dompet lamanya, lalu efek yang baru
 * diterapkan ke dompet yang dipilih — semuanya dalam satu transaksi.
 */
export async function updateExpenseWithWallet(
  userId: string,
  expenseId: number,
  data: {
    amount: number;
    category?: string | null;
    note?: string | null;
    source?: string | null;
    date?: Date;
    walletId: number;
  }
) {
  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.findFirst({
      where: { id: expenseId, ...userOwnedWhere(userId) },
      include: { wallet: true }
    });
    if (!expense) throw new Error("Pengeluaran tidak ditemukan.");
    if (expense.wallet) {
      await tx.wallet.update({
        where: { id: expense.wallet.id },
        data: {
          balance: reverseExpenseFromWalletBalance(
            expense.wallet.balance,
            expense.wallet.isDebt,
            expense.amount
          )
        }
      });
    }
    // Dibaca ulang setelah pembalikan, karena dompetnya bisa sama.
    const wallet = await resolveRequiredWallet(tx, userId, data.walletId);
    const updated = await tx.expense.update({
      where: { id: expense.id },
      data: {
        amount: data.amount,
        category: data.category || null,
        note: data.note || null,
        source: data.source || "gaji",
        date: data.date ?? expense.date,
        walletId: wallet.id
      },
      include: { wallet: true }
    });
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: applyExpenseToWalletBalance(wallet.balance, wallet.isDebt, data.amount) }
    });
    return updated;
  });
}
