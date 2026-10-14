import { prisma } from "@/lib/prisma";
import { wibDay, wibDayDate } from "@/lib/game";
import { readOrMissing } from "@/lib/db-missing";
import { cronAuthorized } from "@/lib/cron-auth";
import { endpointHost, serverSender } from "@/lib/push-send";
import { PUSH_TABLES } from "@/lib/push-server";
import { RECURRING_TABLES, processDueRecurring, userIdsRecordedOn } from "@/lib/recurring-server";
import { noSpendMarkedUserIds } from "@/lib/village-state";
import {
  CRON_SEND_BUDGET_MS,
  MAX_PUSH_FAILURES,
  SEND_CONCURRENCY,
  buildBillDigests,
  planReminders,
  reminderMessage,
  sendAll,
  summarizeDeliveries,
  topicFor,
  ttlFor,
  wibDayRange,
  type BillDigest,
  type PushJob,
  type PushPayload,
  type PushTarget,
  type ReminderJob,
  type ReminderKind,
  type ReminderPrefRow,
  type Sender
} from "@/lib/reminders";

/**
 * Cron pengingat (HANYA server). Dipanggil app/api/cron/postman (07:xx WIB) dan
 * app/api/cron/reminders (20:xx WIB). Semua query per batch (IN …), tidak pernah satu query per user.
 * Aman terpanggil dua kali: tiap jenis diklaim per user per hari WIB (updateManyAndReturn bersyarat)
 * SEBELUM dikirim; yang kalah klaim tidak mengirim apa-apa.
 */

export interface CronRunResult {
  job: ReminderJob;
  today: number;
  dryRun: boolean;
  /** hasil Pak Pos (processDueRecurring); null saat dryRun */
  recurring: { available: boolean; materialized: number; posted: number; error?: true } | null;
  push: {
    /** false = tabel push belum ada */
    available: boolean;
    /** false = VAPID belum diatur: tidak ada yang dikirim */
    configured: boolean;
    subscriptions: number;
    users: number;
    planned: { lamp: number; bills: number };
    claimed: { lamp: number; bills: number };
    sent: number;
    gone: number;
    failed: number;
    removed: number;
    rolledBack: number;
    /** waktu habis sebelum mengklaim: tidak ada yang diklaim/dikirim, putaran berikutnya mencoba lagi */
    outOfTime?: true;
  };
}

const emptyPush = (): CronRunResult["push"] => ({
  available: true,
  configured: false,
  subscriptions: 0,
  users: 0,
  planned: { lamp: 0, bills: 0 },
  claimed: { lamp: 0, bills: 0 },
  sent: 0,
  gone: 0,
  failed: 0,
  removed: 0,
  rolledBack: 0
});

/** Tagihan rutin per user untuk pesan tukang pos. Tabel belum ada → kosong. */
export async function loadBillDigests(userIds: readonly string[], today: number): Promise<Map<string, BillDigest>> {
  if (!userIds.length) return new Map();
  const ids = [...userIds];
  const upTo = wibDayDate(today);
  const { start } = wibDayRange(today);
  const { value } = await readOrMissing(
    RECURRING_TABLES,
    async () => {
      const pending = { userId: { in: ids }, status: "pending", dueDate: { lte: upTo } };
      const byDay = await prisma.recurringOccurrence.groupBy({
        by: ["userId", "dueDate"],
        where: pending,
        _count: { _all: true }
      });
      const savings = await prisma.recurringOccurrence.groupBy({
        by: ["userId"],
        where: { ...pending, recurring: { kind: "saving" } },
        _count: { _all: true }
      });
      const auto = await prisma.recurringOccurrence.groupBy({
        by: ["userId"],
        where: { userId: { in: ids }, status: "posted", postedVia: "auto", resolvedAt: { gte: start } },
        _count: { _all: true }
      });
      return { byDay, savings, auto };
    },
    null
  );
  if (!value) return new Map();
  return buildBillDigests(
    {
      pendingByDay: value.byDay.map((r) => ({ userId: r.userId, day: wibDay(r.dueDate), count: r._count._all })),
      pendingSavings: value.savings.map((r) => ({ userId: r.userId, count: r._count._all })),
      autoToday: value.auto.map((r) => ({ userId: r.userId, count: r._count._all }))
    },
    today
  );
}

type CronJob = PushJob & { target: PushTarget; payload: PushPayload };

/**
 * Satu putaran cron: (1) Pak Pos memproses jatuh tempo semua user, (2) siapa dapat pengingat apa,
 * (3) klaim hari ini, (4) kirim (maks SEND_CONCURRENCY sekaligus, satu notifikasi per perangkat),
 * (5) bereskan: 404/410/401/403 dihapus, gagal lain dihitung (hapus di MAX_PUSH_FAILURES), user yang
 * tidak satu pun perangkatnya menerima karena gangguan sementara dikembalikan klaimnya.
 * `dryRun` = tanpa Pak Pos, tanpa klaim, tanpa kirim (hanya hitungan rencana).
 */
export async function runReminderJob(opts: {
  job: ReminderJob;
  sender: Sender | null;
  now?: number;
  dryRun?: boolean;
  /** APP_PIN aktif: isi notifikasi umum, tanpa jumlah */
  generic?: boolean;
  /** waktu total (ms) sebelum berhenti memulai kiriman baru; bawaan CRON_SEND_BUDGET_MS (sisa untuk beres-beres) */
  budgetMs?: number;
}): Promise<CronRunResult> {
  const now = opts.now ?? Date.now();
  const deadline = Date.now() + (opts.budgetMs ?? CRON_SEND_BUDGET_MS);
  const today = wibDay(now);
  const dryRun = Boolean(opts.dryRun);
  const result: CronRunResult = { job: opts.job, today, dryRun, recurring: null, push: emptyPush() };

  if (!dryRun) {
    try {
      const r = await processDueRecurring({ now, budgetMs: 30_000 });
      result.recurring = { available: r.available, materialized: r.materialized, posted: r.posted };
    } catch (error) {
      // Pengingat tetap jalan untuk tagihan yang sudah ada.
      console.error(`[cron ${opts.job}] tagihan rutin`, error);
      result.recurring = { available: true, materialized: 0, posted: 0, error: true };
    }
  }

  const push = result.push;
  push.configured = opts.sender !== null;
  const read = await readOrMissing(
    PUSH_TABLES,
    () =>
      prisma.webPushSubscription.findMany({
        select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
        orderBy: { id: "asc" }
      }),
    []
  );
  if (read.missing) {
    push.available = false;
    return result;
  }
  const subs = read.value;
  push.subscriptions = subs.length;
  if (!subs.length || (!opts.sender && !dryRun)) return result;

  const subsByUser = new Map<string, typeof subs>();
  for (const s of subs) {
    const list = subsByUser.get(s.userId);
    if (list) list.push(s);
    else subsByUser.set(s.userId, [s]);
  }
  const userIds = [...subsByUser.keys()];
  push.users = userIds.length;

  // Pilihan per user (baris dibuat saat berlangganan; yang belum punya dibuatkan dengan default nyala).
  if (!dryRun) await prisma.reminderPreference.createMany({ data: userIds.map((userId) => ({ userId })), skipDuplicates: true });
  const prefRows = await prisma.reminderPreference.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, lampReminder: true, billReminder: true, lampSentOn: true, billSentOn: true }
  });
  const byUser = new Map(prefRows.map((p) => [p.userId, p]));
  const prefs: ReminderPrefRow[] = userIds.map((userId) => {
    const p = byUser.get(userId);
    return {
      userId,
      lampReminder: p?.lampReminder ?? true,
      billReminder: p?.billReminder ?? true,
      lampSentOn: p?.lampSentOn ? wibDay(p.lampSentOn) : null,
      billSentOn: p?.billSentOn ? wibDay(p.billSentOn) : null
    };
  });

  const notSentToday = (d: number | null) => (d ?? -Infinity) < today;
  const billUsers = prefs.filter((p) => p.billReminder && notSentToday(p.billSentOn)).map((p) => p.userId);
  const lampUsers =
    opts.job === "reminders" ? prefs.filter((p) => p.lampReminder && notSentToday(p.lampSentOn)).map((p) => p.userId) : [];
  const bills = await loadBillDigests(billUsers, today);
  // Lampu: sama dengan lampu streak di desa (pengeluaran/setoran hari ini termasuk baris lama tanpa
  // pemilik, tanpa yang dicatat otomatis Pak Pos) + tanda nol pengeluaran hari ini.
  const recordedToday = lampUsers.length ? await userIdsRecordedOn(lampUsers, today) : new Set<string>();
  const noSpendToday = lampUsers.length ? await noSpendMarkedUserIds(lampUsers, today) : new Set<string>();

  const plans = planReminders({ job: opts.job, today, prefs, bills, recordedToday, noSpendToday });
  const planned = (k: ReminderKind) => plans.filter((p) => p.kinds.includes(k)).map((p) => p.userId);
  push.planned = { lamp: planned("lamp").length, bills: planned("bills").length };
  if (dryRun || !opts.sender) return result;
  // Waktu habis (Pak Pos / query lambat): jangan mengklaim apa pun. Klaim yang semua kirimannya dilewati
  // harus dikembalikan, dan pengembalian itu bisa terpotong saat fungsi dimatikan.
  if (Date.now() >= deadline) {
    push.outOfTime = true;
    return result;
  }

  // Klaim: paling banyak sekali per jenis per user per hari WIB, aman dari cron dobel & bersamaan.
  const todayDate = wibDayDate(today);
  const claim = async (kind: ReminderKind, ids: string[]) => {
    if (!ids.length) return new Set<string>();
    const rows =
      kind === "lamp"
        ? await prisma.reminderPreference.updateManyAndReturn({
            where: { userId: { in: ids }, lampReminder: true, OR: [{ lampSentOn: null }, { lampSentOn: { lt: todayDate } }] },
            data: { lampSentOn: todayDate },
            select: { userId: true }
          })
        : await prisma.reminderPreference.updateManyAndReturn({
            where: { userId: { in: ids }, billReminder: true, OR: [{ billSentOn: null }, { billSentOn: { lt: todayDate } }] },
            data: { billSentOn: todayDate },
            select: { userId: true }
          });
    return new Set(rows.map((r) => r.userId));
  };
  const claimed = { lamp: await claim("lamp", planned("lamp")), bills: await claim("bills", planned("bills")) };
  push.claimed = { lamp: claimed.lamp.size, bills: claimed.bills.size };

  const jobs: CronJob[] = [];
  for (const plan of plans) {
    const kinds = plan.kinds.filter((k) => claimed[k === "lamp" ? "lamp" : "bills"].has(plan.userId));
    if (!kinds.length) continue;
    const payload = reminderMessage(kinds, { bills: plan.bills, today, generic: opts.generic });
    for (const s of subsByUser.get(plan.userId) ?? []) {
      jobs.push({ subscriptionId: s.id, userId: plan.userId, kinds, target: s, payload });
    }
  }
  const sender = opts.sender;
  const results = await sendAll(
    jobs,
    (j) => sender(j.target, j.payload, { ttl: ttlFor(j.payload.kind, now), topic: topicFor(j.payload) }),
    { concurrency: SEND_CONCURRENCY, deadline }
  );
  const summary = summarizeDeliveries(results);
  const at = new Date();
  push.sent = summary.sentIds.length;
  push.gone = summary.goneIds.length;
  push.failed = summary.failedIds.length;

  if (summary.sentIds.length) {
    await prisma.webPushSubscription.updateMany({
      where: { id: { in: summary.sentIds } },
      data: { failureCount: 0, lastSuccessAt: at }
    });
  }
  if (summary.goneIds.length) {
    await prisma.webPushSubscription.deleteMany({ where: { id: { in: summary.goneIds } } });
  }
  if (summary.failedIds.length) {
    await prisma.webPushSubscription.updateMany({
      where: { id: { in: summary.failedIds } },
      data: { failureCount: { increment: 1 }, lastFailureAt: at }
    });
    const removed = await prisma.webPushSubscription.deleteMany({
      where: { id: { in: summary.failedIds }, failureCount: { gte: MAX_PUSH_FAILURES } }
    });
    push.removed = removed.count;
  }
  const back = (kind: ReminderKind) => [...summary.rollback].filter(([, k]) => k.has(kind)).map(([userId]) => userId);
  const backLamp = back("lamp");
  const backBills = back("bills");
  if (backLamp.length) {
    await prisma.reminderPreference.updateMany({
      where: { userId: { in: backLamp }, lampSentOn: todayDate },
      data: { lampSentOn: null }
    });
  }
  if (backBills.length) {
    await prisma.reminderPreference.updateMany({
      where: { userId: { in: backBills }, billSentOn: todayDate },
      data: { billSentOn: null }
    });
  }
  push.rolledBack = summary.rollback.size;

  const problems = results.filter((r) => r.delivery !== "sent");
  if (problems.length) {
    // Hanya status & host: endpoint lengkap = izin mengirim push.
    const counts = new Map<string, number>();
    for (const r of problems) {
      const key = `${r.delivery}:${r.statusCode ?? "-"}@${endpointHost(r.job.target.endpoint)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    console.warn(`[cron ${opts.job}] push tidak terkirim`, Object.fromEntries(counts));
  }
  return result;
}

/** Dipakai kedua route cron: auth Bearer CRON_SECRET, `?dryRun=1`, jawaban hanya hitungan (tanpa data pribadi). */
export async function handleCronRequest(request: Request, job: ReminderJob): Promise<Response> {
  if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  try {
    const result = await runReminderJob({
      job,
      sender: serverSender(),
      dryRun,
      generic: Boolean(process.env.APP_PIN)
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`[cron ${job}]`, error);
    return Response.json({ error: "Gagal menjalankan cron." }, { status: 500 });
  }
}
