import { DAY_MS, WIB_OFFSET_MS } from "@/lib/game";

/**
 * Pengingat web push (murni, tanpa Prisma/web-push; dites di reminders.test.ts). Server-nya di
 * lib/reminder-cron.ts (cron) dan lib/push-server.ts (aksi user); service worker di public/sw.js.
 *
 * Dua cron Vercel (Hobby: sekali sehari per jadwal, jam UTC, bisa telat sampai 59 menit, bisa
 * terpanggil dua kali):
 * - postman   "0 0 * * *"  → 07:00–07:59 WIB: Pak Pos memproses jatuh tempo, lalu push tagihan.
 * - reminders "0 13 * * *" → 20:00–20:59 WIB: proses jatuh tempo lagi (susulan), push lampu yang
 *   belum menyala + tagihan yang belum dikabarkan hari ini.
 * Tiap jenis paling banyak sekali per user per hari WIB (ReminderPreference.lampSentOn/billSentOn,
 * diklaim dengan updateMany bersyarat SEBELUM mengirim). Isi notifikasi hanya jumlah, tidak pernah
 * nominal atau nama tagihan; dengan APP_PIN isinya umum sama sekali.
 */

export type ReminderJob = "postman" | "reminders";
export type ReminderKind = "lamp" | "bills";

export const CRON_POSTMAN = "0 0 * * *";
export const CRON_REMINDERS = "0 13 * * *";
export const CRON_PATHS: Record<ReminderJob, string> = {
  postman: "/api/cron/postman",
  reminders: "/api/cron/reminders"
};
/** Untuk teks UI & README (Hobby bisa telat sampai 59 menit). */
export const REMINDER_TIMES = {
  lamp: "sekitar pukul 20.00–21.00 WIB",
  bills: "sekitar pukul 07.00–08.00 WIB"
} as const;

/**
 * Tagihan yang menunggu dikabarkan selama jatuh temponya ≤ sekian hari lalu (hari H + 3 hari telat),
 * sesudah itu diam: Pak Pos tetap menunggu di kotak pos, tapi HP tidak ditagih tiap pagi selamanya.
 */
export const BILL_NAG_DAYS = 3;
/** Kegagalan kirim beruntun (selain 404/410/401/403 yang langsung dihapus) sebelum langganan dihapus. */
export const MAX_PUSH_FAILURES = 5;
export const SEND_CONCURRENCY = 8;

// ── Anggaran waktu cron ──────────────────────────────────────────────────────
/** maxDuration route cron (literal di app/api/cron/{postman,reminders}/route.ts; tes memeriksa sama). */
export const CRON_MAX_DURATION_S = 60;
/** Batas satu kiriman web-push (socket idle di web-push): layanan push yang macet menahan kiriman selama ini. */
export const SEND_TIMEOUT_MS = 10_000;
/** Cadangan untuk membereskan hasil kirim (4–6 tulis berurutan, connection_limit=1) dan cold start. */
export const CRON_CLEANUP_RESERVE_MS = 10_000;
/**
 * Sejak awal putaran, tidak ada kiriman baru yang dimulai setelah sekian ms (sisanya "skipped" & klaimnya
 * dikembalikan). Kiriman terakhir yang macet (SEND_TIMEOUT_MS) plus beres-beres tetap selesai sebelum
 * Vercel mematikan fungsi di maxDuration, jadi klaim yang gagal terkirim selalu sempat dikembalikan.
 */
export const CRON_SEND_BUDGET_MS = CRON_MAX_DURATION_S * 1000 - SEND_TIMEOUT_MS - CRON_CLEANUP_RESERVE_MS;
/** Satu akun paling banyak sekian perangkat; yang paling lama tidak dipakai dibuang. */
export const MAX_DEVICES_PER_USER = 10;

// ── Status untuk bagian 🔔 Pengingat (dikirim server action ke browser) ───────

/** Pilihan per AKUN (ReminderPreference), berlaku untuk semua perangkatnya. */
export interface ReminderPrefs {
  lampReminder: boolean;
  billReminder: boolean;
}
export const DEFAULT_REMINDER_PREFS: ReminderPrefs = Object.freeze({ lampReminder: true, billReminder: true });

/** Satu perangkat yang menerima pengingat. Endpoint-nya sengaja tidak dikirim ke browser. */
export interface PushDevice {
  id: number;
  label: string;
  /** langganan browser yang sedang membuka desa */
  here: boolean;
  lastSuccessAt: string | null;
}

export interface ReminderStatus {
  /** false = tabel push belum ada (migrasi tepira belum jalan) */
  available: boolean;
  /** kunci VAPID di server sah (atau mode log) */
  configured: boolean;
  /** perangkat ini terdaftar untuk akun ini */
  registered: boolean;
  prefs: ReminderPrefs;
  devices: PushDevice[];
}

// ── Waktu ────────────────────────────────────────────────────────────────────

/** Rentang waktu satu hari WIB: [start, end). */
export function wibDayRange(day: number) {
  return { start: new Date(day * DAY_MS - WIB_OFFSET_MS), end: new Date((day + 1) * DAY_MS - WIB_OFFSET_MS) };
}

/** Detik sampai tengah malam WIB (min 60): pengingat "hari ini" tidak boleh sampai besok. */
export function secondsUntilWibMidnight(now: number) {
  const left = DAY_MS - ((now + WIB_OFFSET_MS) % DAY_MS);
  return Math.max(60, Math.floor(left / 1000));
}

// ── Siapa dapat apa ──────────────────────────────────────────────────────────

/** Tagihan rutin seorang user, dihitung dari tabel RecurringOccurrence (lihat buildBillDigests). */
export interface BillDigest {
  /** semua tagihan pending yang jatuh temponya ≤ hari ini (= angka chip 📮 di desa) */
  pending: number;
  /** yang jatuh temponya dalam BILL_NAG_DAYS hari terakhir (termasuk hari ini) */
  recent: number;
  /** yang jatuh temponya sebelum hari ini */
  overdue: number;
  /** yang berupa setoran rutin ke goal (sisanya tagihan pengeluaran) */
  savings: number;
  /** dicatat otomatis (⚡) hari ini */
  autoToday: number;
}

export const NO_BILLS: BillDigest = Object.freeze({ pending: 0, recent: 0, overdue: 0, savings: 0, autoToday: 0 });

/** Hasil groupBy (lihat lib/reminder-cron.ts) → ringkasan per user. Hari = wibDay. */
export function buildBillDigests(
  rows: {
    pendingByDay: readonly { userId: string; day: number; count: number }[];
    pendingSavings: readonly { userId: string; count: number }[];
    autoToday: readonly { userId: string; count: number }[];
  },
  today: number
): Map<string, BillDigest> {
  const out = new Map<string, BillDigest>();
  const get = (userId: string) => {
    let d = out.get(userId);
    if (!d) out.set(userId, (d = { ...NO_BILLS }));
    return d;
  };
  for (const r of rows.pendingByDay) {
    if (r.day > today || r.count <= 0) continue;
    const d = get(r.userId);
    d.pending += r.count;
    if (r.day >= today - BILL_NAG_DAYS) d.recent += r.count;
    if (r.day < today) d.overdue += r.count;
  }
  for (const r of rows.pendingSavings) if (r.count > 0) get(r.userId).savings += r.count;
  for (const r of rows.autoToday) if (r.count > 0) get(r.userId).autoToday += r.count;
  for (const d of out.values()) d.savings = Math.min(d.savings, d.pending);
  return out;
}

/** Ada yang layak dikabarkan: tagihan yang baru jatuh tempo (≤ BILL_NAG_DAYS) atau catatan otomatis hari ini. */
export const billsWorthPinging = (d: BillDigest | undefined): d is BillDigest =>
  Boolean(d && (d.recent > 0 || d.autoToday > 0));

export interface ReminderPrefRow {
  userId: string;
  lampReminder: boolean;
  billReminder: boolean;
  /** hari WIB terakhir pengingat lampu terkirim (null = belum pernah) */
  lampSentOn: number | null;
  billSentOn: number | null;
}

export interface PlanInput {
  job: ReminderJob;
  today: number;
  /** satu baris per user yang punya langganan push */
  prefs: readonly ReminderPrefRow[];
  bills: ReadonlyMap<string, BillDigest>;
  /** user yang hari ini sudah tercatat (tanpa catatan otomatis Pak Pos), hanya untuk "reminders" */
  recordedToday: ReadonlySet<string>;
  /** user yang menandai hari ini nol pengeluaran, hanya untuk "reminders" */
  noSpendToday: ReadonlySet<string>;
}

export interface ReminderPlan {
  userId: string;
  kinds: ReminderKind[];
  bills: BillDigest | null;
}

/** Siapa dapat pengingat apa di putaran ini (sebelum klaim; klaim di database yang memutuskan akhirnya). */
export function planReminders(i: PlanInput): ReminderPlan[] {
  const plans: ReminderPlan[] = [];
  for (const p of i.prefs) {
    const kinds: ReminderKind[] = [];
    const lamp =
      i.job === "reminders" &&
      p.lampReminder &&
      (p.lampSentOn ?? -Infinity) < i.today &&
      !i.recordedToday.has(p.userId) &&
      !i.noSpendToday.has(p.userId);
    if (lamp) kinds.push("lamp");
    const digest = i.bills.get(p.userId);
    if (p.billReminder && (p.billSentOn ?? -Infinity) < i.today && billsWorthPinging(digest)) kinds.push("bills");
    if (kinds.length) plans.push({ userId: p.userId, kinds, bills: kinds.includes("bills") ? digest ?? null : null });
  }
  return plans;
}

// ── Isi notifikasi ───────────────────────────────────────────────────────────

export type PushKind = "lamp" | "bills" | "both" | "test";

/** Yang dibaca public/sw.js. `url` selalu /village…, `tag` mengelompokkan per jenis + hari. */
export interface PushPayload {
  v: 1;
  kind: PushKind;
  title: string;
  body: string;
  tag: string;
  url: string;
}

/** `?buka=` dari URL notifikasi → panel desa ("pos" = 📮 kotak pos, lainnya = 🏝️ perkembangan desa). */
export function panelForBuka(buka: string | null | undefined): "village" | "letter" | null {
  if (!buka) return null;
  return buka === "pos" ? "letter" : "village";
}

const URLS: Record<PushKind, string> = {
  lamp: "/village?buka=desa",
  bills: "/village?buka=pos",
  both: "/village?buka=pos",
  test: "/village"
};

/** "tagihan" / "setoran rutin" / "kiriman" (campuran). */
export function billNoun(d: Pick<BillDigest, "pending" | "savings">) {
  if (d.savings <= 0) return "tagihan";
  return d.savings >= d.pending ? "setoran rutin" : "kiriman";
}

function billText(d: BillDigest): { title: string; body: string } {
  if (d.pending <= 0) {
    return {
      title: "📬 Tukang pos sudah mampir",
      body: `${d.autoToday} kiriman rutin sudah dicatat otomatis hari ini. Cek di kotak pos desa.`
    };
  }
  const due =
    d.overdue <= 0
      ? "Jatuh tempo hari ini."
      : d.overdue >= d.pending
        ? "Sudah lewat jatuh tempo."
        : `${d.overdue} di antaranya sudah lewat jatuh tempo.`;
  const auto = d.autoToday > 0 ? ` ${d.autoToday} lainnya sudah dicatat otomatis.` : "";
  return {
    title: `📬 Tukang pos membawa ${d.pending} ${billNoun(d)}`,
    body: `${due} Buka kotak pos desa untuk mencatat atau melewatinya.${auto}`
  };
}

const LAMP_TITLE = "💡 Lampu hari ini belum menyala";
const GENERIC = { title: "🏝️ tepira village", body: "Ada pengingat dari desamu. Buka desa untuk melihatnya." };

export function pushKindOf(kinds: readonly ReminderKind[]): Exclude<PushKind, "test"> {
  const lamp = kinds.includes("lamp");
  const bills = kinds.includes("bills");
  return lamp && bills ? "both" : lamp ? "lamp" : "bills";
}

/**
 * Satu notifikasi per perangkat per putaran (jenis digabung). `generic` = APP_PIN aktif: tanpa
 * jumlah sama sekali, karena layar kunci tidak dilindungi PIN desa.
 */
export function reminderMessage(
  kinds: readonly ReminderKind[],
  ctx: { bills: BillDigest | null; today: number; generic?: boolean }
): PushPayload {
  const kind = pushKindOf(kinds);
  const tag = `${kind === "lamp" ? "lampu" : kind === "bills" ? "pos" : "pengingat"}-${ctx.today}`;
  const base = { v: 1 as const, kind, tag, url: URLS[kind] };
  if (ctx.generic) return { ...base, ...GENERIC };
  const bills = ctx.bills ?? NO_BILLS;
  if (kind === "lamp") {
    return {
      ...base,
      title: LAMP_TITLE,
      body: "Catat pengeluaran atau setoran hari ini, atau tandai nol pengeluaran kalau memang tidak belanja."
    };
  }
  if (kind === "bills") return { ...base, ...billText(bills) };
  const also =
    bills.pending > 0
      ? `Tukang pos juga membawa ${bills.pending} ${billNoun(bills)}.`
      : `Tukang pos juga mencatat ${bills.autoToday} kiriman rutin otomatis.`;
  return { ...base, title: LAMP_TITLE, body: `${also} Buka desa untuk mencatat sebelum tengah malam.` };
}

export function testMessage(): PushPayload {
  return {
    v: 1,
    kind: "test",
    title: "🔔 Pengingat menyala",
    body: "Begini nanti pengingat desa muncul di perangkat ini.",
    tag: "tes",
    url: URLS.test
  };
}

/**
 * Topic web push (≤ 32 karakter base64url): pesan yang belum terkirim dengan topic sama diganti
 * yang baru di layanan push. Sama dengan tag (jenis + hari).
 */
export const topicFor = (payload: Pick<PushPayload, "tag">) => payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "tepira";

/** TTL detik: lampu sampai tengah malam WIB, tagihan maks 12 jam (dan tidak lewat tengah malam), tes 1 jam. */
export function ttlFor(kind: PushKind, now: number) {
  const midnight = secondsUntilWibMidnight(now);
  if (kind === "test") return 3600;
  if (kind === "bills") return Math.min(12 * 3600, midnight);
  return midnight;
}

// ── Kirim & hasilnya ─────────────────────────────────────────────────────────

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SendOptions {
  ttl: number;
  topic: string;
  urgency?: "very-low" | "low" | "normal" | "high";
}

export interface SendOutcome {
  ok: boolean;
  /** status HTTP dari layanan push; undefined = jaringan/timeout */
  statusCode?: number;
}

/** Pengirim (web-push sungguhan di lib/push-send.ts, atau log/palsu untuk dev & tes). */
export type Sender = (target: PushTarget, payload: PushPayload, opts: SendOptions) => Promise<SendOutcome>;

export type Delivery = "sent" | "gone" | "failed" | "skipped";

/**
 * 404/410 = langganan sudah tidak ada; 401/403 = kunci VAPID tidak cocok dengan langganannya (kunci
 * diganti) → hapus (perangkatnya berlangganan ulang sendiri saat desa dibuka). 408/429/5xx/jaringan =
 * coba lagi nanti. Lainnya (400, 413) = gagal, dihitung.
 */
export function classifyPushStatus(statusCode?: number): { delivery: "gone" | "failed"; retry: boolean } {
  if (statusCode === 404 || statusCode === 410 || statusCode === 401 || statusCode === 403) {
    return { delivery: "gone", retry: false };
  }
  if (statusCode === undefined || statusCode === 408 || statusCode === 429 || statusCode >= 500) {
    return { delivery: "failed", retry: true };
  }
  return { delivery: "failed", retry: false };
}

export interface DeliveryResult<J> {
  job: J;
  delivery: Delivery;
  retry: boolean;
  statusCode?: number;
}

/**
 * Kirim semua dengan paling banyak `concurrency` sekaligus. Setelah `deadline` (ms epoch) tidak ada
 * kiriman baru yang dimulai: sisanya "skipped" (klaimnya dikembalikan, putaran berikutnya mencoba lagi).
 * `send` yang melempar error dianggap gagal jaringan.
 */
export async function sendAll<J>(
  jobs: readonly J[],
  send: (job: J) => Promise<SendOutcome>,
  opts: { concurrency?: number; deadline?: number; clock?: () => number } = {}
): Promise<DeliveryResult<J>[]> {
  const concurrency = Math.max(1, opts.concurrency ?? SEND_CONCURRENCY);
  const clock = opts.clock ?? Date.now;
  const results: DeliveryResult<J>[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= jobs.length) return;
      const job = jobs[i];
      if (opts.deadline !== undefined && clock() >= opts.deadline) {
        results[i] = { job, delivery: "skipped", retry: true };
        continue;
      }
      let outcome: SendOutcome;
      try {
        outcome = await send(job);
      } catch {
        outcome = { ok: false };
      }
      if (outcome.ok) {
        results[i] = { job, delivery: "sent", retry: false, statusCode: outcome.statusCode };
      } else {
        const c = classifyPushStatus(outcome.statusCode);
        results[i] = { job, delivery: c.delivery, retry: c.retry, statusCode: outcome.statusCode };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return results;
}

export interface PushJob {
  subscriptionId: number;
  userId: string;
  kinds: readonly ReminderKind[];
}

export interface DeliverySummary {
  sentIds: number[];
  goneIds: number[];
  failedIds: number[];
  /**
   * User yang tidak satu pun perangkatnya menerima, padahal ada yang bisa dicoba lagi (jaringan,
   * 429/5xx, kehabisan waktu): klaim harinya dikembalikan supaya putaran berikut (cron dobel, cron
   * malam) mencoba lagi.
   */
  rollback: Map<string, Set<ReminderKind>>;
}

export function summarizeDeliveries(results: readonly DeliveryResult<PushJob>[]): DeliverySummary {
  const sentIds: number[] = [];
  const goneIds: number[] = [];
  const failedIds: number[] = [];
  const delivered = new Set<string>();
  const retryable = new Map<string, Set<ReminderKind>>();
  for (const r of results) {
    const { subscriptionId, userId, kinds } = r.job;
    if (r.delivery === "sent") {
      sentIds.push(subscriptionId);
      delivered.add(userId);
      continue;
    }
    if (r.delivery === "gone") goneIds.push(subscriptionId);
    if (r.delivery === "failed") failedIds.push(subscriptionId);
    if (r.retry) {
      const set = retryable.get(userId) ?? new Set<ReminderKind>();
      for (const k of kinds) set.add(k);
      retryable.set(userId, set);
    }
  }
  const rollback = new Map<string, Set<ReminderKind>>();
  for (const [userId, kinds] of retryable) if (!delivered.has(userId)) rollback.set(userId, kinds);
  return { sentIds, goneIds, failedIds, rollback };
}
