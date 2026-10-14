"use server";

import { prisma } from "@/lib/prisma";
import { requireActionUserId, signOut, userOwnedWhere } from "@/lib/auth";
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
import { MISSING_TABLE_MESSAGE, isMissingTable } from "@/lib/db-missing";
import { parseSyncOps, type SyncResult } from "@/lib/village-sync";
import { applyVillageOps, loadVillageSync } from "@/lib/village-state";
import { dayLabel, dueLabel, snapshotFromEarlierDay, type RecurringInput } from "@/lib/recurring";
import {
  createRecurringRule,
  deleteRecurringRule,
  processDueRecurring,
  recurringChangedSince,
  setRecurringActive,
  settleBills,
  skipOlderBills,
  updateRecurringRule
} from "@/lib/recurring-server";
import { wibDay } from "@/lib/game";

/**
 * Semua server action menulis ke database tepira dengan aturan yang sama
 * persis seperti server actions / API routes di repo tepira, lalu
 * mengembalikan snapshot terbaru supaya desa langsung ter-update dalam
 * satu kali perjalanan ke server.
 */

type Period = { month: number; year: number };

const requireUserId = requireActionUserId;

/** `fn` boleh mengembalikan pesan sukses (tanpa nominal): ditampilkan store sebagai notice. */
async function run(period: Period, fn: (userId: string) => Promise<string | void>): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const notice = await fn(userId);
    const { month, year } = normalizePeriod(period.month, period.year);
    return { ok: true, snapshot: await buildSnapshot(userId, month, year), ...(notice ? { notice } : {}) };
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

/**
 * Tagihan rutin yang jatuh tempo dibuat & yang ⚡ otomatis dicatat sebelum snapshot dibangun. Tidak
 * pernah menggagalkan aksinya (tabel belum ada / error lain cukup dicatat di log).
 */
async function processQuietly(userId: string) {
  try {
    return await processDueRecurring({ userId });
  } catch (error) {
    console.error("[recurring]", error);
    return null;
  }
}

export async function fetchSnapshot(period: Period): Promise<ActionResult> {
  return run(period, async (userId) => {
    await processQuietly(userId);
  });
}

// ── Tagihan & setoran rutin ("Pak Pos") ──────────────────────────────────────

/**
 * Hasil syncRecurring: changed:false = snapshot tab itu masih terbaru, snapshot tidak dibangun.
 * `day` = hari WIB yang dipakai server (jam browser bisa lebih cepat: tab mencoba lagi sebentar lagi).
 */
export type RecurringSyncResult = ({ ok: true; changed: false } | ActionResult) & { day?: number };

/** Selisih waktu antar instance server; tulisan di sekitar waktu snapshot dibuat tetap terhitung. */
const SINCE_SLACK_MS = 5_000;

/**
 * Aksi ringan saat hari WIB berganti / tab kembali dilihat: proses jatuh tempo, lalu snapshot baru
 * dibangun kalau panggilan ini membuat/mencatat sesuatu, kalau snapshot tab (`since` = generatedAt)
 * dari hari WIB sebelumnya, atau kalau tagihan rutin berubah sejak snapshot itu (cron pagi, perangkat
 * lain). Tanpa itu tab yang tidur melewati tengah malam tidak pernah melihat tagihan yang dibuat cron.
 */
export async function syncRecurring(period: Period, since?: string): Promise<RecurringSyncResult> {
  try {
    const userId = await requireUserId();
    const day = wibDay(Date.now());
    const result = await processQuietly(userId);
    const now = Date.now();
    // snapshotFromEarlierDay juga menangkap `since` yang kosong/rusak, jadi sinceMs di bawahnya sah.
    const sinceMs = typeof since === "string" ? Date.parse(since) : Number.NaN;
    const changed =
      Boolean(result && (result.materialized || result.posted)) ||
      (Boolean(result?.available) &&
        (snapshotFromEarlierDay(since, now) ||
          (await recurringChangedSince(userId, new Date(Math.min(sinceMs, now) - SINCE_SLACK_MS)))));
    if (!changed) return { ok: true, changed: false, day };
    const { month, year } = normalizePeriod(period.month, period.year);
    return { ok: true, snapshot: await buildSnapshot(userId, month, year), day };
  } catch (error) {
    console.error("[recurring sync]", error);
    return { ok: false, message: error instanceof Error ? error.message : "Terjadi kesalahan." };
  }
}

const dueWords = (day: number) => {
  const today = wibDay(Date.now());
  const when = dueLabel(day, today);
  return day - today > 1 ? `${dayLabel(day)} (${when})` : when;
};

export async function createRecurring(input: RecurringInput, period: Period): Promise<ActionResult> {
  return run(period, async (userId) => {
    const rule = await createRecurringRule(userId, input);
    await processQuietly(userId); // jatuh tempo hari ini: tagihannya langsung diantar
    const kind = input.kind === "saving" ? "Setoran rutin" : "Tagihan rutin";
    return `🔁 ${kind} "${rule.title}" disimpan. Pertama: ${dueWords(rule.nextDueDay)}.`;
  });
}

export async function updateRecurring(id: number, input: RecurringInput, period: Period): Promise<ActionResult> {
  return run(period, async (userId) => {
    const rule = await updateRecurringRule(userId, toInt(id), input);
    await processQuietly(userId);
    return rule.scheduleMoved
      ? `🔁 "${rule.title}" disimpan. Berikutnya: ${dueWords(rule.nextDueDay)}.`
      : `🔁 "${rule.title}" disimpan. Berlaku untuk tagihan berikutnya.`;
  });
}

export async function setRecurringStatus(id: number, active: boolean, period: Period): Promise<ActionResult> {
  return run(period, async (userId) => {
    const r = await setRecurringActive(userId, toInt(id), Boolean(active));
    if (!active) return "⏸️ Dijeda. Pak Pos tidak mengantar tagihan baru sampai dilanjutkan.";
    await processQuietly(userId);
    return `▶️ Dilanjutkan. Tagihan selama dijeda tidak ditagih${r.nextDueDay !== null ? `; berikutnya ${dueWords(r.nextDueDay)}` : ""}.`;
  });
}

export async function deleteRecurring(id: number, period: Period): Promise<ActionResult> {
  return run(period, async (userId) => {
    await deleteRecurringRule(userId, toInt(id));
    return "🗑 Dihapus. Catatan yang sudah tercatat tetap ada.";
  });
}

/** Catat / Lewati tagihan di kotak pos (maks 24 sekaligus). Yang gagal tidak menggagalkan yang lain. */
export async function settleRecurringBills(decisions: unknown, period: Period): Promise<ActionResult> {
  return run(period, async (userId) => {
    const r = await settleBills(userId, decisions);
    if (r.errors.length && !r.posted && !r.skipped) throw new Error(r.errors[0]);
    const parts: string[] = [];
    if (r.posted) parts.push(`📮 ${r.posted} tagihan tercatat`);
    if (r.skipped) parts.push(`${r.skipped} dilewati`);
    let notice = parts.length ? `${parts.join(", ")}.` : "";
    if (r.stale) notice += " Sebagian sudah dicatat di perangkat lain.";
    if (r.errors.length) notice += ` ${r.errors.length} gagal: ${r.errors[0]}`;
    return notice.trim() || "Tagihan ini sudah dicatat di perangkat lain.";
  });
}

/** Lewati semua tagihan lama satu aturan, kecuali yang paling baru. */
export async function skipOldRecurringBills(recurringId: number, period: Period): Promise<ActionResult> {
  return run(period, async (userId) => {
    const n = await skipOlderBills(userId, toInt(recurringId));
    return n ? `${n} tagihan lama dilewati. Tinggal yang terbaru.` : "Tidak ada tagihan lama.";
  });
}

// ── Data desa yang sinkron antar perangkat ───────────────────────────────────

/**
 * Kirim op data desa (tanda nol pengeluaran, batas jajan, surat, perayaan, tur) dan terima versi
 * terbaru dari server. `ops` kosong = hanya menarik perubahan dari perangkat lain. Sengaja tidak
 * membangun snapshot penuh (12+ query) untuk satu klik lampu.
 *
 * `owner` = email pemilik outbox di browser. Kalau sesi sudah berganti akun, op akun lain ditolak
 * (tetap di outbox sampai akun itu login lagi). ok:true HANYA kalau op benar-benar tersimpan;
 * code "missing" = tabelnya belum ada (migrasi tepira belum jalan), browser menyimpan op-nya dulu.
 */
export async function syncVillage(owner: string, ops: unknown): Promise<SyncResult> {
  try {
    const userId = await requireUserId();
    // Email dari database, bukan dari JWT (bisa basi), sama dengan snapshot.user.email.
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (typeof owner !== "string" || (user?.email ?? "anon") !== owner) {
      return { ok: false, code: "owner", message: "Akun di tab ini sudah berganti. Muat ulang halaman, ya." };
    }
    const missing = { ok: false, code: "missing", message: MISSING_TABLE_MESSAGE } as const;
    if (!(await applyVillageOps(userId, parseSyncOps(ops)))) return missing;
    const sync = await loadVillageSync(userId);
    return sync.available ? { ok: true, sync } : missing;
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, code: "missing", message: MISSING_TABLE_MESSAGE };
    console.error("[village sync]", error);
    return { ok: false, code: "error", message: error instanceof Error ? error.message : "Terjadi kesalahan." };
  }
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
