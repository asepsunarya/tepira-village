import type { Prisma, RecurringTransaction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { userOwnedWhere } from "@/lib/auth";
import { DAY_MS, WIB_OFFSET_MS, wibDay, wibDayDate } from "@/lib/game";
import { MISSING_TABLE_MESSAGE, isMissingTable, knownMissing, noteMissingTable, readOrMissing } from "@/lib/db-missing";
import { createExpenseInTx } from "@/lib/wallet-expenses";
import {
  AUTO_MAX_AGE_DAYS,
  MAX_AUTO_PER_RUN,
  MAX_CATCH_UP,
  MAX_EVERY,
  MAX_FIRST_DUE_DAYS,
  MAX_RULES_PER_USER,
  NO_RECURRING,
  alignStart,
  autoPostPrecheck,
  canAutoPost,
  defaultTitle,
  dueBetween,
  firstOnOrAfter,
  nextAfter,
  parseBillDecisions,
  parseRecurringInput,
  rescheduledNextDue,
  ruleStatus,
  scheduleChanged,
  type BlockReason,
  type Frequency,
  type ParsedRecurring,
  type RecurringData,
  type RecurringLink,
  type RecurringView
} from "@/lib/recurring";

/**
 * Tagihan & setoran rutin di database (HANYA server; jangan diimpor dari kode client). Aturan
 * jadwal & "otomatis atau tagihan" ada di lib/recurring.ts (murni + tes); di sini query yang aman
 * dijalankan bersamaan dari beberapa tab, perangkat, dan cron:
 * - Membuat tagihan: compare-and-set nextDueDate (+ updatedAt) di aturan, lalu createMany
 *   skipDuplicates (unik recurringId+dueDate). Yang kalah balapan tidak membuat apa-apa.
 * - Menyelesaikan tagihan: klaim updateMany status pending → posted/skipped (dengan userId), lalu
 *   pengeluaran (aturan dompet tepira, createExpenseInTx) atau setoran, lalu tautannya. Satu transaksi
 *   pendek per tagihan, hanya `tx` di dalamnya (connection_limit=1), tanpa Promise.all.
 * Tabel baru ber-userId NOT NULL: selalu `{ userId }`. userOwnedWhere hanya untuk dompet/goal (baris lama).
 * Tabel belum ada (migrasi tepira belum jalan): baca → kosong, tulis → MISSING_TABLE_MESSAGE.
 */

/** Label untuk knownMissing / noteMissingTable (lib/db-missing.ts). */
export const RECURRING_TABLES = "RecurringTransaction/RecurringOccurrence";

type Tx = Prisma.TransactionClient;
type RuleRow = RecurringTransaction;
type RuleRowWithNames = RuleRow & { wallet?: { name: string } | null; goal?: { title: string } | null };

/** Transaksi per tagihan: pendek, tapi boleh menunggu satu-satunya koneksi sebentar. */
const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };
/** Baris per query saat memproses banyak aturan/tagihan (cron). */
const BATCH = 100;
const AUTO_RECENT_MS = 7 * DAY_MS;

/**
 * Aturan yang dihapus user tapi sudah punya tagihan selesai (posted/skipped) disimpan dengan mode ini
 * (dan active=false): hanya lewat baris tagihan itu desa tahu sebuah pengeluaran/setoran dicatat
 * OTOMATIS (tidak menyalakan lampu streak, tidak dihitung pengingat lampu) dan dari tagihan rutin (🔁).
 * RecurringOccurrence.recurring onDelete: Cascade, jadi menghapus aturannya ikut menghapus jejak itu.
 * Aturan berarsip tidak pernah tampil, diproses, diubah, atau dihitung ke batas MAX_RULES_PER_USER.
 */
export const ARCHIVED_MODE = "archived";
const LIVE = { mode: { not: ARCHIVED_MODE } };

const asFrequency = (v: string): Frequency => (v === "weekly" || v === "yearly" ? v : "monthly");

/** Baris database → bentuk yang dikirim ke browser (tanggal = hari WIB). */
export function toRecurringView(row: RuleRowWithNames): RecurringView {
  return {
    id: row.id,
    kind: row.kind === "saving" ? "saving" : "expense",
    title: row.title,
    amount: row.amount,
    category: row.category,
    note: row.note,
    source: row.source === "bonus" ? "bonus" : "gaji",
    mode: row.mode === "auto" ? "auto" : "confirm",
    active: row.active,
    frequency: asFrequency(row.frequency),
    every: Math.min(MAX_EVERY, Math.max(1, row.repeatEvery || 1)),
    dayOfMonth: row.dayOfMonth,
    startDay: wibDay(row.startDate),
    nextDueDay: wibDay(row.nextDueDate),
    maxOccurrences: row.maxOccurrences,
    occurrenceCount: row.occurrenceCount,
    walletId: row.walletId,
    walletName: row.wallet?.name ?? null,
    goalId: row.goalId,
    goalTitle: row.goal?.title ?? null,
    placeName: row.placeName,
    latitude: row.latitude,
    longitude: row.longitude
  };
}

/** Tulis ke tabel baru: tabel belum ada → pesan ramah (dan tidak ditanya lagi selama 60 dtk). */
async function writeGuard<T>(fn: () => Promise<T>): Promise<T> {
  if (knownMissing(RECURRING_TABLES)) throw new Error(MISSING_TABLE_MESSAGE);
  try {
    return await fn();
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    noteMissingTable(RECURRING_TABLES);
    throw new Error(MISSING_TABLE_MESSAGE);
  }
}

// ── Baca untuk snapshot ──────────────────────────────────────────────────────

/** Aturan, tagihan yang menunggu, dan catatan otomatis 7 hari. Tabel belum ada → NO_RECURRING. */
export async function loadRecurring(userId: string, now = Date.now()): Promise<RecurringData> {
  const { value } = await readOrMissing(RECURRING_TABLES, () => readRecurring(userId, now), null);
  return value ?? NO_RECURRING;
}

async function readRecurring(userId: string, now: number): Promise<RecurringData> {
  const [rules, bills, autos] = await Promise.all([
    prisma.recurringTransaction.findMany({
      where: { userId, ...LIVE },
      include: { wallet: { select: { name: true } }, goal: { select: { title: true } } },
      orderBy: [{ nextDueDate: "asc" }, { id: "asc" }],
      take: MAX_RULES_PER_USER
    }),
    prisma.recurringOccurrence.findMany({
      where: { userId, status: "pending" },
      select: { id: true, recurringId: true, dueDate: true, amount: true },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: 300
    }),
    prisma.recurringOccurrence.findMany({
      where: {
        userId,
        status: "posted",
        postedVia: "auto",
        resolvedAt: { gte: new Date(now - AUTO_RECENT_MS) },
        recurring: LIVE
      },
      select: { id: true, recurringId: true, dueDate: true, amount: true, resolvedAt: true },
      orderBy: { id: "desc" },
      take: 20
    })
  ]);
  return {
    available: true,
    rules: rules.map(toRecurringView),
    bills: bills.map((b) => ({ id: b.id, recurringId: b.recurringId, day: wibDay(b.dueDate), amount: b.amount })),
    autoPosted: autos.map((a) => ({
      id: a.id,
      recurringId: a.recurringId,
      day: wibDay(a.dueDate),
      amount: a.amount,
      at: (a.resolvedAt ?? new Date(now)).toISOString()
    }))
  };
}

/**
 * Pengeluaran & setoran yang dicatat OTOMATIS sejak hari WIB `sinceDay`: tidak menyalakan lampu
 * streak (yang dicatat lewat tombol Catat tetap menyala). Tabel belum ada → kosong.
 */
export async function autoPostedLinks(userId: string, sinceDay: number) {
  const { value } = await readOrMissing(
    RECURRING_TABLES,
    () =>
      prisma.recurringOccurrence.findMany({
        // +31 hari: tanggal pengeluarannya bisa diubah setelah dicatat
        where: { userId, status: "posted", postedVia: "auto", dueDate: { gte: wibDayDate(sinceDay - 31) } },
        select: { expenseId: true, contributionId: true }
      }),
    []
  );
  return {
    expenseIds: new Set(value.flatMap((o) => (o.expenseId === null ? [] : [o.expenseId]))),
    contributionIds: new Set(value.flatMap((o) => (o.contributionId === null ? [] : [o.contributionId])))
  };
}

/** Tanda 🔁 untuk pengeluaran & setoran yang tampil (dibuat dari tagihan rutin). */
export async function recurringLinks(userId: string, expenseIds: readonly number[], contributionIds: readonly number[]) {
  const expenses = new Map<number, RecurringLink>();
  const contributions = new Map<number, RecurringLink>();
  if (!expenseIds.length && !contributionIds.length) return { expenses, contributions };
  const { value } = await readOrMissing(
    RECURRING_TABLES,
    () =>
      prisma.recurringOccurrence.findMany({
        where: {
          userId,
          OR: [{ expenseId: { in: [...expenseIds] } }, { contributionId: { in: [...contributionIds] } }]
        },
        select: { expenseId: true, contributionId: true, recurringId: true, postedVia: true }
      }),
    []
  );
  for (const o of value) {
    const link = { id: o.recurringId, auto: o.postedVia === "auto" };
    if (o.expenseId !== null) expenses.set(o.expenseId, link);
    if (o.contributionId !== null) contributions.set(o.contributionId, link);
  }
  return { expenses, contributions };
}

// ── Memproses jatuh tempo (halaman dibuka, aksi, cron) ──────────────────────

export interface ProcessResult {
  /** false = tabelnya belum ada (tidak ada yang diproses) */
  available: boolean;
  /** tagihan baru yang dibuat */
  materialized: number;
  /** tagihan yang dicatat otomatis */
  posted: number;
  /** user yang mendapat tagihan baru atau catatan otomatis */
  users: string[];
}

/**
 * Buat tagihan yang sudah jatuh tempo (maks MAX_CATCH_UP per aturan per putaran), lalu catat sendiri
 * tagihan aturan ⚡ otomatis yang umurnya ≤ AUTO_MAX_AGE_DAYS dan tidak terhalang (maks MAX_AUTO_PER_RUN
 * per user). Tanpa `userId` = semua user, per batch, berhenti memulai pekerjaan baru setelah `budgetMs`.
 * Aman dijalankan bersamaan (dua tab, cron + halaman): balapan diselesaikan compare-and-set & klaim.
 * Tidak melempar error untuk tabel yang belum ada (available:false).
 */
export async function processDueRecurring(
  opts: { userId?: string; now?: number; budgetMs?: number } = {}
): Promise<ProcessResult> {
  const now = opts.now ?? Date.now();
  const today = wibDay(now);
  const deadline = Date.now() + (opts.budgetMs ?? (opts.userId ? 8_000 : 40_000));
  const users = new Set<string>();
  let materialized = 0;
  let posted = 0;
  if (knownMissing(RECURRING_TABLES)) return { available: false, materialized, posted, users: [] };
  const byUser = opts.userId ? { userId: opts.userId } : {};
  try {
    // 1) Surat tagihan baru.
    let cursor = 0;
    for (let more = true; more && Date.now() < deadline; ) {
      const rows = await prisma.recurringTransaction.findMany({
        where: { ...byUser, active: true, nextDueDate: { lte: wibDayDate(today) }, id: { gt: cursor } },
        orderBy: { id: "asc" },
        take: BATCH
      });
      more = rows.length === BATCH;
      for (const row of rows) {
        cursor = row.id;
        if (Date.now() >= deadline) break;
        try {
          const n = await materializeRule(row, today);
          if (n > 0) {
            materialized += n;
            users.add(row.userId);
          }
        } catch (error) {
          if (isMissingTable(error)) throw error;
          console.error("[recurring] gagal membuat tagihan", row.id, error);
        }
      }
    }

    // 2) Catat otomatis. Tagihan satu aturan berurutan: kalau yang lama terhalang, yang baru menunggu.
    cursor = 0;
    const perUser = new Map<string, number>();
    const stuck = new Set<number>();
    /** dompet/goal aturan masih ada (dicek sekali per aturan per putaran, tanpa transaksi) */
    const refsOk = new Map<number, boolean>();
    for (let more = true; more && Date.now() < deadline; ) {
      const pending = await prisma.recurringOccurrence.findMany({
        where: {
          ...byUser,
          status: "pending",
          id: { gt: cursor },
          dueDate: { gte: wibDayDate(today - AUTO_MAX_AGE_DAYS), lte: wibDayDate(today) },
          recurring: { mode: "auto" }
        },
        select: {
          id: true,
          userId: true,
          recurringId: true,
          dueDate: true,
          recurring: {
            select: { mode: true, kind: true, active: true, maxOccurrences: true, occurrenceCount: true, walletId: true, goalId: true }
          }
        },
        orderBy: { id: "asc" },
        take: BATCH
      });
      more = pending.length === BATCH;
      for (const o of pending) {
        cursor = o.id;
        if (Date.now() >= deadline) break;
        if (stuck.has(o.recurringId) || (perUser.get(o.userId) ?? 0) >= MAX_AUTO_PER_RUN) continue;
        try {
          // Yang pasti terhalang (dijeda, dompet/goal lepas atau sudah dihapus) tidak membuka transaksi
          // tiap putaran. Keputusan akhirnya tetap di dalam transaksi resolveOccurrence.
          if (!(await autoPostLikely(o, today, refsOk))) {
            stuck.add(o.recurringId);
            continue;
          }
          if ((await resolveOccurrence(o.userId, o.id, { action: "pay", via: "auto" }, now)) === "posted") {
            posted++;
            perUser.set(o.userId, (perUser.get(o.userId) ?? 0) + 1);
            users.add(o.userId);
          } else {
            stuck.add(o.recurringId);
          }
        } catch (error) {
          if (isMissingTable(error)) throw error;
          stuck.add(o.recurringId);
          console.error("[recurring] gagal mencatat otomatis", o.id, error);
        }
      }
    }
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    noteMissingTable(RECURRING_TABLES);
    return { available: false, materialized, posted, users: [...users] };
  }
  return { available: true, materialized, posted, users: [...users] };
}

type AutoRuleRow = Pick<RuleRow, "mode" | "kind" | "active" | "maxOccurrences" | "occurrenceCount" | "walletId" | "goalId">;

/**
 * Saringan sebelum transaksi catat-otomatis: autoPostPrecheck (murni), lalu dompet/goal yang dirujuk
 * masih ada & goal belum tercapai (sekali per aturan per putaran, di luar transaksi).
 */
async function autoPostLikely(
  o: { userId: string; recurringId: number; dueDate: Date; recurring: AutoRuleRow },
  today: number,
  refsOk: Map<number, boolean>
) {
  const r = o.recurring;
  const rule = {
    mode: r.mode === "auto" ? ("auto" as const) : ("confirm" as const),
    kind: r.kind === "saving" ? ("saving" as const) : ("expense" as const),
    active: r.active,
    maxOccurrences: r.maxOccurrences,
    occurrenceCount: r.occurrenceCount,
    walletId: r.walletId,
    goalId: r.goalId
  };
  if (!autoPostPrecheck(rule, wibDay(o.dueDate), today)) return false;
  let ok = refsOk.get(o.recurringId);
  if (ok === undefined) {
    ok = (await blockedInTx(prisma, o.userId, rule)) === null;
    refsOk.set(o.recurringId, ok);
  }
  return ok;
}

/** Buat tagihan pending untuk jatuh tempo ≤ hari ini. Kembalian = jumlah tagihan baru. */
async function materializeRule(row: RuleRow, today: number): Promise<number> {
  const rule = toRecurringView(row);
  const remaining = rule.maxOccurrences === null ? null : rule.maxOccurrences - rule.occurrenceCount;
  // updatedAt ikut dicek: aturan yang baru diedit (nominal, jadwal) tidak dibuatkan tagihan dari versi lamanya.
  const guard = { id: row.id, userId: row.userId, active: true, nextDueDate: row.nextDueDate, updatedAt: row.updatedAt };
  const days = dueBetween(rule, rule.nextDueDay, today, MAX_CATCH_UP, remaining);
  if (!days.length) {
    if (remaining !== null && remaining <= 0) {
      // Cicilan sudah habis tapi masih aktif (mis. diubah di tempat lain): tutup.
      await prisma.recurringTransaction.updateMany({ where: guard, data: { active: false } });
    } else {
      // nextDueDate di luar jadwal (data dari luar desa): rapikan supaya tidak ditanya terus.
      const fixed = firstOnOrAfter(rule, rule.nextDueDay);
      if (fixed !== rule.nextDueDay) {
        await prisma.recurringTransaction.updateMany({ where: guard, data: { nextDueDate: wibDayDate(fixed) } });
      }
    }
    return 0;
  }
  const next = nextAfter(rule, days[days.length - 1]);
  const ended = remaining !== null && days.length >= remaining;
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.recurringTransaction.updateMany({
      where: guard,
      data: {
        nextDueDate: wibDayDate(next),
        occurrenceCount: { increment: days.length },
        ...(ended ? { active: false } : {})
      }
    });
    if (!count) return 0; // tab / perangkat / cron lain lebih dulu
    const created = await tx.recurringOccurrence.createMany({
      data: days.map((d) => ({
        recurringId: row.id,
        userId: row.userId,
        dueDate: wibDayDate(d),
        // Nominal disalin sekarang: mengubah aturan nanti tidak mengubah tagihan yang sudah diantar.
        amount: row.amount,
        status: "pending"
      })),
      skipDuplicates: true
    });
    return created.count;
  }, TX_OPTIONS);
}

/** Dicek ulang di dalam transaksi sebelum mencatat otomatis (dan sekali di luar transaksi, autoPostLikely). */
async function blockedInTx(
  tx: Tx,
  userId: string,
  rule: Pick<RecurringView, "kind" | "walletId" | "goalId">
): Promise<BlockReason | null> {
  if (rule.kind === "expense") {
    if (rule.walletId === null) return "no-wallet";
    const wallet = await tx.wallet.findFirst({ where: { id: rule.walletId, ...userOwnedWhere(userId) }, select: { id: true } });
    return wallet ? null : "no-wallet";
  }
  if (rule.goalId === null) return "no-goal";
  const goal = await tx.goal.findFirst({ where: { id: rule.goalId, ...userOwnedWhere(userId) }, select: { targetAmount: true } });
  if (!goal) return "no-goal";
  const { _sum } = await tx.contribution.aggregate({ where: { goalId: rule.goalId }, _sum: { amount: true } });
  return goal.targetAmount > 0 && (_sum.amount ?? 0) >= goal.targetAmount ? "goal-done" : null;
}

export type ResolveResult = "posted" | "skipped" | "stale" | "blocked";

export interface ResolveOptions {
  action: "pay" | "skip";
  /** auto = Pak Pos mencatat sendiri (tidak menyalakan lampu streak); confirm = user menekan Catat/Lewati */
  via: "auto" | "confirm";
  amount?: number;
  walletId?: number;
  remember?: boolean;
}

/**
 * Selesaikan satu tagihan dalam satu transaksi: klaim (pending → posted/skipped), buat pengeluaran
 * (aturan dompet tepira) atau setoran bertanggal jatuh temponya, tautkan. "stale" = sudah diselesaikan
 * di tempat lain (bukan error); "blocked" = auto tapi terhalang (tidak ada yang ditulis). Error lain
 * (mis. dompet sudah dihapus) membatalkan semuanya, termasuk klaimnya.
 */
export async function resolveOccurrence(
  userId: string,
  occurrenceId: number,
  opt: ResolveOptions,
  now = Date.now()
): Promise<ResolveResult> {
  const today = wibDay(now);
  return prisma.$transaction(async (tx) => {
    const occ = await tx.recurringOccurrence.findFirst({
      where: { id: occurrenceId, userId },
      include: { recurring: true }
    });
    if (!occ || occ.status !== "pending") return "stale";
    const dueDay = wibDay(occ.dueDate);
    if (dueDay > today) return "stale";
    const rule = toRecurringView(occ.recurring);
    const amount = opt.amount ?? occ.amount;
    if (opt.via === "auto") {
      if (opt.action !== "pay") return "blocked";
      if (!canAutoPost(rule, dueDay, today, await blockedInTx(tx, userId, rule))) return "blocked";
    }

    // Klaim: baris terkunci; tab/perangkat/cron lain yang menunggu mendapat count 0.
    const { count } = await tx.recurringOccurrence.updateMany({
      where: { id: occ.id, userId, status: "pending" },
      data: {
        status: opt.action === "pay" ? "posted" : "skipped",
        postedVia: opt.via,
        resolvedAt: new Date(now),
        ...(opt.action === "pay" ? { amount } : {})
      }
    });
    if (!count) return "stale";
    if (opt.action === "skip") return "skipped";

    const note = rule.note || rule.title;
    const date = wibDayDate(dueDay);
    if (rule.kind === "expense") {
      const walletId = opt.walletId ?? rule.walletId;
      if (!walletId) throw new Error(`Dompet untuk "${rule.title}" sudah dihapus. Pilih dompet lain dulu, ya.`);
      const expense = await createExpenseInTx(tx, userId, {
        amount,
        category: rule.category,
        note,
        source: rule.source,
        date,
        walletId,
        place: { placeName: rule.placeName, latitude: rule.latitude, longitude: rule.longitude }
      });
      await tx.recurringOccurrence.update({ where: { id: occ.id }, data: { expenseId: expense.id } });
      if (opt.remember && opt.walletId && opt.walletId !== rule.walletId) {
        // Dompetnya sudah dicek milik user oleh createExpenseInTx.
        await tx.recurringTransaction.updateMany({ where: { id: rule.id, userId }, data: { walletId: opt.walletId } });
      }
    } else {
      // Sama seperti addContribution: goal dicek kepemilikannya, setoran tidak menyentuh dompet.
      const goal = rule.goalId
        ? await tx.goal.findFirst({ where: { id: rule.goalId, ...userOwnedWhere(userId) } })
        : null;
      if (!goal) throw new Error(`Goal tujuan "${rule.title}" sudah tidak ada.`);
      const contribution = await tx.contribution.create({ data: { goalId: goal.id, amount, note, date } });
      if (!goal.userId) await tx.goal.update({ where: { id: goal.id }, data: { userId } });
      await tx.recurringOccurrence.update({ where: { id: occ.id }, data: { contributionId: contribution.id } });
    }
    return "posted";
  }, TX_OPTIONS);
}

// ── Aksi user ────────────────────────────────────────────────────────────────

function checkFirstDue(day: number, today: number) {
  if (day < today) throw new Error("Jatuh tempo berikutnya tidak boleh sebelum hari ini (tagihan lama tidak ditagih mundur).");
  if (day > today + MAX_FIRST_DUE_DAYS) throw new Error(`Jatuh tempo berikutnya maksimal ${MAX_FIRST_DUE_DAYS} hari dari hari ini.`);
}

/** Dompet / goal yang dirujuk harus milik user (baris lama tanpa pemilik boleh, seperti tepira). */
async function ownedRefs(db: Tx, userId: string, p: ParsedRecurring) {
  if (p.kind === "expense") {
    const wallet = await db.wallet.findFirst({ where: { id: p.walletId!, ...userOwnedWhere(userId) }, select: { id: true } });
    if (!wallet) throw new Error("Dompet tidak ditemukan.");
    return { goalTitle: null };
  }
  const goal = await db.goal.findFirst({ where: { id: p.goalId!, ...userOwnedWhere(userId) }, select: { title: true } });
  if (!goal) throw new Error("Goal tidak ditemukan.");
  return { goalTitle: goal.title };
}

/** Buat aturan baru. Jatuh tempo pertama ≥ hari ini (tidak ada tagihan mundur). */
export async function createRecurringRule(userId: string, raw: unknown, now = Date.now()) {
  const p = parseRecurringInput(raw);
  const today = wibDay(now);
  checkFirstDue(p.firstDueDay, today);
  const startDay = alignStart(p.frequency, p.dayOfMonth, p.firstDueDay);
  return writeGuard(() =>
    prisma.$transaction(async (tx) => {
      const { goalTitle } = await ownedRefs(tx, userId, p);
      if ((await tx.recurringTransaction.count({ where: { userId, ...LIVE } })) >= MAX_RULES_PER_USER) {
        throw new Error(`Maksimal ${MAX_RULES_PER_USER} tagihan & setoran rutin. Hapus yang sudah tidak dipakai dulu, ya.`);
      }
      const row = await tx.recurringTransaction.create({
        data: {
          userId,
          kind: p.kind,
          title: defaultTitle(p, goalTitle),
          amount: p.amount,
          category: p.category,
          note: p.note,
          source: p.source,
          frequency: p.frequency,
          repeatEvery: p.every,
          dayOfMonth: p.dayOfMonth,
          startDate: wibDayDate(startDay),
          nextDueDate: wibDayDate(startDay),
          maxOccurrences: p.maxOccurrences,
          occurrenceCount: p.paidBefore,
          mode: p.mode,
          active: true,
          placeName: p.placeName,
          latitude: p.latitude,
          longitude: p.longitude,
          walletId: p.walletId,
          goalId: p.goalId
        }
      });
      return { id: row.id, title: row.title, nextDueDay: startDay };
    }, TX_OPTIONS)
  );
}

/**
 * Ubah aturan. Nominal, nama, kategori, dompet/goal, sumber, tempat, mode: hanya untuk tagihan
 * berikutnya (yang sudah diantar memakai nominal salinannya). Jadwal berubah → jadwal baru dimulai dari
 * tanggal pilihan (≥ hari ini) dengan fase & harinya, dan tanggal yang sudah punya tagihan dilewati
 * menyusuri jadwal itu (rescheduledNextDue): satu tanggal tidak pernah ditagih dua kali. Form yang tidak
 * menyentuh jadwal mengirim keepSchedule, jadi tab yang basi tidak memindahkan jadwal.
 */
export async function updateRecurringRule(userId: string, id: number, raw: unknown, now = Date.now()) {
  const p = parseRecurringInput(raw);
  const today = wibDay(now);
  return writeGuard(() =>
    prisma.$transaction(async (tx) => {
      const row = await tx.recurringTransaction.findFirst({ where: { id, userId, ...LIVE } });
      if (!row) throw new Error("Tagihan rutin tidak ditemukan.");
      if (row.kind !== p.kind) throw new Error("Jenis rutin tidak bisa diubah. Buat yang baru saja, ya.");
      const { goalTitle } = await ownedRefs(tx, userId, p);
      const cur = toRecurringView(row);
      const title = defaultTitle(p, goalTitle);
      const data: Prisma.RecurringTransactionUncheckedUpdateManyInput = {
        title,
        amount: p.amount,
        category: p.category,
        note: p.note,
        source: p.source,
        mode: p.mode,
        placeName: p.placeName,
        latitude: p.latitude,
        longitude: p.longitude,
        walletId: p.walletId,
        goalId: p.goalId,
        maxOccurrences: p.maxOccurrences
      };
      let nextDueDay = cur.nextDueDay;
      const moved = scheduleChanged(cur, p);
      if (moved) {
        checkFirstDue(p.firstDueDay, today);
        const last = await tx.recurringOccurrence.aggregate({ where: { recurringId: id }, _max: { dueDate: true } });
        nextDueDay = rescheduledNextDue(p, today, last._max.dueDate ? wibDay(last._max.dueDate) : null);
        Object.assign(data, {
          frequency: p.frequency,
          repeatEvery: p.every,
          dayOfMonth: p.dayOfMonth,
          startDate: wibDayDate(nextDueDay),
          nextDueDate: wibDayDate(nextDueDay)
        });
      }
      const wasEnded = ruleStatus(cur) === "ended";
      if (p.maxOccurrences !== null && cur.occurrenceCount >= p.maxOccurrences) {
        data.active = false; // cicilan dikurangi sampai habis = selesai
      } else if (wasEnded) {
        // Cicilan ditambah: lanjut dari hari ini, tanpa tagihan mundur.
        data.active = true;
        if (!moved) {
          nextDueDay = firstOnOrAfter(cur, Math.max(today, cur.nextDueDay));
          data.nextDueDate = wibDayDate(nextDueDay);
        }
      }
      const { count } = await tx.recurringTransaction.updateMany({ where: { id, userId, updatedAt: row.updatedAt }, data });
      if (!count) throw new Error("Tagihan rutin ini baru saja berubah (mungkin di perangkat lain). Coba simpan lagi.");
      return { title, nextDueDay, scheduleMoved: moved };
    }, TX_OPTIONS)
  );
}

/**
 * Jeda / lanjutkan. Dilanjutkan → jatuh tempo berikutnya digulung ke hari ini atau sesudahnya:
 * periode selama dijeda tidak ditagih. Tagihan yang sudah ada di kotak pos tetap di sana.
 */
export async function setRecurringActive(userId: string, id: number, active: boolean, now = Date.now()) {
  const today = wibDay(now);
  return writeGuard(async () => {
    if (!active) {
      const { count } = await prisma.recurringTransaction.updateMany({ where: { id, userId, ...LIVE }, data: { active: false } });
      if (!count) throw new Error("Tagihan rutin tidak ditemukan.");
      return { nextDueDay: null as number | null };
    }
    return prisma.$transaction(async (tx) => {
      const row = await tx.recurringTransaction.findFirst({ where: { id, userId, ...LIVE } });
      if (!row) throw new Error("Tagihan rutin tidak ditemukan.");
      const cur = toRecurringView(row);
      if (ruleStatus(cur) === "ended") throw new Error("Cicilan ini sudah lunas. Tambah jumlah cicilannya lewat ✏️ kalau mau lanjut.");
      if (cur.active) return { nextDueDay: cur.nextDueDay };
      const nextDueDay = firstOnOrAfter(cur, Math.max(today, cur.nextDueDay));
      const { count } = await tx.recurringTransaction.updateMany({
        where: { id, userId, updatedAt: row.updatedAt },
        data: { active: true, nextDueDate: wibDayDate(nextDueDay) }
      });
      if (!count) throw new Error("Tagihan rutin ini baru saja berubah (mungkin di perangkat lain). Coba lagi.");
      return { nextDueDay };
    }, TX_OPTIONS);
  });
}

/**
 * Hapus aturan + tagihannya yang menunggu. Pengeluaran/setoran yang sudah tercatat tetap ada, begitu juga
 * baris tagihan yang sudah selesai: aturan yang masih punya baris itu diarsipkan (ARCHIVED_MODE), bukan
 * dihapus, supaya catatan otomatisnya tetap tidak menyalakan lampu streak. Tanpa tagihan = dihapus.
 */
export async function deleteRecurringRule(userId: string, id: number) {
  return writeGuard(() =>
    prisma.$transaction(async (tx) => {
      // Kunci & matikan aturannya dulu: pembuatan tagihan yang sedang berjalan selesai dulu, yang
      // berikutnya kalah compare-and-set (updatedAt berubah).
      const { count } = await tx.recurringTransaction.updateMany({ where: { id, userId, ...LIVE }, data: { active: false } });
      if (!count) return 0;
      // Menunggu klaim Catat/otomatis yang sedang berjalan; tagihan yang jadi posted tidak ikut terhapus.
      await tx.recurringOccurrence.deleteMany({ where: { recurringId: id, userId, status: "pending" } });
      if (await tx.recurringOccurrence.count({ where: { recurringId: id } })) {
        await tx.recurringTransaction.updateMany({ where: { id, userId }, data: { mode: ARCHIVED_MODE } });
      } else {
        await tx.recurringTransaction.deleteMany({ where: { id, userId } });
      }
      return 1;
    }, TX_OPTIONS)
  );
}

export interface SettleSummary {
  posted: number;
  skipped: number;
  /** sudah diselesaikan di tab/perangkat lain */
  stale: number;
  /** pesan kegagalan (mis. dompet sudah dihapus); tagihan lain tetap diproses */
  errors: string[];
}

/** Catat / Lewati dari kotak pos, satu transaksi per tagihan, paling lama dulu. */
export async function settleBills(userId: string, raw: unknown, now = Date.now()): Promise<SettleSummary> {
  const decisions = parseBillDecisions(raw);
  const out: SettleSummary = { posted: 0, skipped: 0, stale: 0, errors: [] };
  await writeGuard(async () => {
    for (const d of decisions) {
      try {
        const r = await resolveOccurrence(userId, d.id, { ...d, via: "confirm" }, now);
        if (r === "posted") out.posted++;
        else if (r === "skipped") out.skipped++;
        else out.stale++;
      } catch (error) {
        if (isMissingTable(error)) throw error;
        out.errors.push(error instanceof Error ? error.message : "Terjadi kesalahan.");
      }
    }
  });
  return out;
}

/** "Lewati yang lama": semua tagihan aturan ini yang menunggu dilewati kecuali yang paling baru. */
export async function skipOlderBills(userId: string, recurringId: number, now = Date.now()) {
  return writeGuard(async () => {
    const pending = await prisma.recurringOccurrence.findMany({
      where: { userId, recurringId, status: "pending" },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      select: { id: true }
    });
    const older = pending.slice(0, -1).map((o) => o.id);
    if (!older.length) return 0;
    const { count } = await prisma.recurringOccurrence.updateMany({
      where: { id: { in: older }, userId, status: "pending" },
      data: { status: "skipped", postedVia: "confirm", resolvedAt: new Date(now) }
    });
    return count;
  });
}

/**
 * Ada aturan / tagihan rutin user ini yang berubah setelah `since`? Mis. tagihan hari ini dibuat &
 * dicatat otomatis oleh cron, atau dicatat/diubah di perangkat lain: snapshot tab yang lebih lama perlu
 * diganti walau syncRecurring sendiri tidak membuat apa-apa. Tabel belum ada → false.
 */
export async function recurringChangedSince(userId: string, since: Date): Promise<boolean> {
  const { value } = await readOrMissing(
    RECURRING_TABLES,
    async () => {
      const where = { userId, updatedAt: { gt: since } };
      if (await prisma.recurringOccurrence.findFirst({ where, select: { id: true } })) return true;
      return (await prisma.recurringTransaction.findFirst({ where, select: { id: true } })) !== null;
    },
    false
  );
  return value;
}

// ── Untuk cron & pengingat ───────────────────────────────────────────────────

/**
 * Tagihan yang menunggu per user (untuk push "📮 N tagihan"): total dan yang jatuh tempo hari ini.
 * Tanpa `userIds` = semua user. Tabel belum ada → kosong.
 */
export async function pendingBillCounts(
  opts: { userIds?: readonly string[]; now?: number } = {}
): Promise<Map<string, { total: number; dueToday: number }>> {
  const today = wibDayDate(wibDay(opts.now ?? Date.now()));
  const where = { status: "pending", ...(opts.userIds ? { userId: { in: [...opts.userIds] } } : {}) };
  const out = new Map<string, { total: number; dueToday: number }>();
  if (opts.userIds && !opts.userIds.length) return out;
  const { value } = await readOrMissing(
    RECURRING_TABLES,
    async () => {
      const total = await prisma.recurringOccurrence.groupBy({ by: ["userId"], where, _count: { _all: true } });
      const dueToday = await prisma.recurringOccurrence.groupBy({
        by: ["userId"],
        where: { ...where, dueDate: today },
        _count: { _all: true }
      });
      return { total, dueToday };
    },
    null
  );
  for (const r of value?.total ?? []) out.set(r.userId, { total: r._count._all, dueToday: 0 });
  for (const r of value?.dueToday ?? []) {
    const cur = out.get(r.userId);
    if (cur) cur.dueToday = r._count._all;
  }
  return out;
}

/**
 * User (dari `userIds`) yang hari WIB `day` sudah "tercatat" untuk lampu streak: punya pengeluaran
 * atau setoran bertanggal hari itu yang BUKAN dicatat otomatis oleh Pak Pos. Definisi sama dengan
 * activityDays di snapshot (userOwnedWhere): baris lama tanpa pemilik (userId null, atau setoran ke
 * goal tanpa pemilik) terlihat oleh semua akun, jadi menyalakan lampu SEMUA user. Tanda nol
 * pengeluaran dicek terpisah (noSpendMarkedUserIds).
 */
export async function userIdsRecordedOn(userIds: readonly string[], day: number): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const from = new Date(day * DAY_MS - WIB_OFFSET_MS);
  const to = new Date(from.getTime() + DAY_MS);
  const ids = [...userIds];
  const expenses = await prisma.expense.findMany({
    where: { OR: [{ userId: { in: ids } }, { userId: null }], date: { gte: from, lt: to } },
    select: { id: true, userId: true }
  });
  const contributions = await prisma.contribution.findMany({
    where: { goal: { OR: [{ userId: { in: ids } }, { userId: null }] }, date: { gte: from, lt: to } },
    select: { id: true, goal: { select: { userId: true } } }
  });
  const { value: autos } = await readOrMissing(
    RECURRING_TABLES,
    () =>
      prisma.recurringOccurrence.findMany({
        where: {
          status: "posted",
          postedVia: "auto",
          OR: [{ expenseId: { in: expenses.map((e) => e.id) } }, { contributionId: { in: contributions.map((c) => c.id) } }]
        },
        select: { expenseId: true, contributionId: true }
      }),
    []
  );
  const autoExpenses = new Set(autos.map((a) => a.expenseId));
  const autoContributions = new Set(autos.map((a) => a.contributionId));
  const out = new Set<string>();
  let legacy = false;
  for (const e of expenses) {
    if (autoExpenses.has(e.id)) continue;
    if (e.userId) out.add(e.userId);
    else legacy = true;
  }
  for (const c of contributions) {
    if (autoContributions.has(c.id)) continue;
    if (c.goal.userId) out.add(c.goal.userId);
    else legacy = true;
  }
  return legacy ? new Set(ids) : out;
}
