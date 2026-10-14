import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { userOwnedWhere } from "@/lib/auth";

/**
 * Port dari tepira/lib/wallet-expenses.ts.
 * Aturan saldo dompet HARUS sama persis dengan tepira supaya data konsisten
 * ketika kedua app menulis ke database yang sama.
 *
 * Bedanya satu: saldo diubah dengan `increment` atomik, bukan baca-hitung-tulis. Tagihan rutin
 * yang dicatat otomatis bisa berjalan bersamaan dengan catatan manual di dompet yang sama, dan
 * baca-hitung-tulis bisa menghilangkan salah satunya. (tepira sebaiknya di-port dengan cara yang sama.)
 * Ubah/hapus membalik nominal LAMA pengeluarannya, jadi baris pengeluarannya dikunci dulu (lockExpense):
 * dua tab yang mengubah/menghapus pengeluaran yang sama tidak membalik nominal lama dua kali.
 */
type Tx = Prisma.TransactionClient;

function expenseBalanceDelta(isDebt: boolean, amount: number) {
  // Dompet aset (bank, cash, e-wallet) berkurang saat belanja.
  // Dompet utang (credit/paylater) bertambah karena yang terutang naik.
  return isDebt ? amount : -amount;
}

/**
 * Lokasi opsional pengeluaran (peta jajan). Hanya dipakai desa; tepira belum menulisnya dan
 * tidak memengaruhi aturan saldo dompet di bawah.
 */
export interface ExpensePlace {
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
}

async function resolveRequiredWallet(tx: Tx, userId: string, walletId: number) {
  const wallet = walletId
    ? await tx.wallet.findFirst({ where: { id: walletId, ...userOwnedWhere(userId) } })
    : null;
  if (!wallet) throw new Error("Dompet wajib dipilih dan harus milik user ini.");
  return wallet;
}

export interface ExpenseInput {
  amount: number;
  category?: string | null;
  note?: string | null;
  source?: string | null;
  date?: Date;
  walletId: number;
  place?: ExpensePlace;
}

/**
 * Isi createExpenseWithWallet untuk dipakai di dalam transaksi lain (tagihan rutin: klaim tagihan +
 * pengeluaran + potong saldo jadi satu). Hanya memakai `tx` (connection_limit=1).
 */
export async function createExpenseInTx(tx: Tx, userId: string, data: ExpenseInput) {
  const wallet = await resolveRequiredWallet(tx, userId, data.walletId);
  const expense = await tx.expense.create({
    data: {
      amount: data.amount,
      category: data.category || null,
      note: data.note || null,
      source: data.source || "gaji",
      date: data.date || new Date(),
      userId,
      walletId: wallet.id,
      ...data.place
    }
  });
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: expenseBalanceDelta(wallet.isDebt, data.amount) } }
  });
  return expense;
}

export async function createExpenseWithWallet(userId: string, data: ExpenseInput) {
  return prisma.$transaction((tx) => createExpenseInTx(tx, userId, data));
}

/**
 * Kunci baris pengeluaran sebelum dibaca. Tanpa ini dua transaksi bisa membaca nominal lama yang sama
 * lalu sama-sama membaliknya ke dompet (increment), dan saldo bergeser diam-diam. Sesudah kunci,
 * findFirst (READ COMMITTED) melihat nominal & dompet terbaru; urutan kunci sama di ubah & hapus
 * (pengeluaran, lalu dompet), jadi keduanya tidak saling deadlock. Tabel tanpa @@map: "Expense".
 */
async function lockExpense(tx: Tx, expenseId: number) {
  await tx.$queryRaw`SELECT 1 FROM "Expense" WHERE id = ${expenseId} FOR UPDATE`;
}

export async function deleteExpenseAndRestoreWallet(userId: string, expenseId: number) {
  return prisma.$transaction(async (tx) => {
    await lockExpense(tx, expenseId);
    const expense = await tx.expense.findFirst({
      where: { id: expenseId, ...userOwnedWhere(userId) },
      include: { wallet: true }
    });
    if (!expense) return null;
    await tx.expense.delete({ where: { id: expense.id } });
    if (expense.wallet) {
      await tx.wallet.update({
        where: { id: expense.wallet.id },
        data: { balance: { increment: -expenseBalanceDelta(expense.wallet.isDebt, expense.amount) } }
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
    /** undefined = lokasi lama dipertahankan */
    place?: ExpensePlace;
  }
) {
  return prisma.$transaction(async (tx) => {
    await lockExpense(tx, expenseId);
    const expense = await tx.expense.findFirst({
      where: { id: expenseId, ...userOwnedWhere(userId) },
      include: { wallet: true }
    });
    if (!expense) throw new Error("Pengeluaran tidak ditemukan.");
    if (expense.wallet) {
      await tx.wallet.update({
        where: { id: expense.wallet.id },
        data: { balance: { increment: -expenseBalanceDelta(expense.wallet.isDebt, expense.amount) } }
      });
    }
    const wallet = await resolveRequiredWallet(tx, userId, data.walletId);
    const updated = await tx.expense.update({
      where: { id: expense.id },
      data: {
        amount: data.amount,
        category: data.category || null,
        note: data.note || null,
        source: data.source || "gaji",
        date: data.date ?? expense.date,
        walletId: wallet.id,
        ...data.place
      },
      include: { wallet: true }
    });
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: expenseBalanceDelta(wallet.isDebt, data.amount) } }
    });
    return updated;
  });
}
