import { wibDayDate } from "@/lib/game";
import { roundCoord } from "@/lib/places";
import { daysInMonth, wibDateParts, wibDayOf } from "@/lib/season";

/**
 * Transaksi berulang ("Pak Pos" mengantar tagihan): langganan, cicilan, sewa (kind "expense") dan
 * setoran rutin ke goal (kind "saving"). Modul murni: dipakai server (lib/recurring-server.ts),
 * store, panel, dan tes. Semua tanggal = hari WIB (lihat wibDay di lib/game.ts); kolom DATE di
 * database ditulis dengan wibDayDate(day) dan dibaca dengan wibDay(date).
 *
 * Alur (tabel milik migrasi tepira):
 * - RecurringTransaction = aturannya. nextDueDate = jatuh tempo berikutnya yang BELUM punya baris
 *   occurrence. Dibuat / dilanjutkan dari jeda → nextDueDate digulung ke hari ini atau sesudahnya
 *   (tidak ada tagihan mundur).
 * - Saat jatuh tempo, server MEMBUAT baris RecurringOccurrence berstatus "pending" (= surat tagihan
 *   di kotak pos), maks MAX_CATCH_UP per aturan per putaran.
 * - Tagihan lalu DISELESAIKAN: "posted" (pengeluaran/setoran dibuat, postedVia "auto" | "confirm")
 *   atau "skipped". Aturan ⚡ otomatis mencatat sendiri tagihan yang umurnya ≤ AUTO_MAX_AGE_DAYS dan
 *   tidak terhalang (dompet dihapus, goal sudah tercapai); sisanya menunggu Catat / Lewati.
 */

export type Frequency = "weekly" | "monthly" | "yearly";
export type RecurringKind = "expense" | "saving";
export type RecurringMode = "confirm" | "auto";
export type RecurringStatus = "active" | "paused" | "ended";
/** Kenapa tagihan tidak bisa dicatat otomatis (dan butuh perhatian). */
export type BlockReason = "no-wallet" | "no-goal" | "goal-done";

export interface RecurrenceRule {
  frequency: Frequency;
  /** tiap N minggu / bulan / tahun (kolom repeatEvery) */
  every: number;
  /** monthly/yearly: tanggal 1..31, 29–31 dijepit ke hari terakhir bulan itu; weekly: null */
  dayOfMonth: number | null;
  /** jatuh tempo pertama: fase untuk every > 1, hari untuk weekly, bulan untuk yearly */
  startDay: number;
}

/** Tagihan otomatis yang lebih tua dari ini tidak dicatat sendiri ("lama tidak dibuka, cek dulu"). */
export const AUTO_MAX_AGE_DAYS = 35;
/** Tagihan yang dibuat per aturan per putaran; sisanya menyusul di putaran berikutnya. */
export const MAX_CATCH_UP = 12;
/** Tagihan otomatis yang dicatat per user per putaran (halaman dibuka, cron). */
export const MAX_AUTO_PER_RUN = 24;
export const MAX_EVERY = 12;
export const MAX_OCCURRENCES = 360;
export const MAX_RULES_PER_USER = 100;
/** Keputusan Catat / Lewati per panggilan server. */
export const MAX_SETTLE_BATCH = 24;
/** Jatuh tempo pertama paling jauh sekian hari dari hari ini. */
export const MAX_FIRST_DUE_DAYS = 400;
export const UPCOMING_DAYS = 3;
export const MAX_TITLE = 60;
export const MAX_NOTE = 200;
/** Tagihan per aturan yang ditampilkan di kotak pos; sisanya "+N lagi". */
export const MAX_BILLS_PER_RULE = 12;
const MAX_AMOUNT = 2_147_483_647;

const monthIndex = (year: number, month: number) => year * 12 + (month - 1);
const monthStep = (r: Pick<RecurrenceRule, "frequency" | "every">) => (r.frequency === "yearly" ? 12 : 1) * r.every;
const anchorOf = (r: RecurrenceRule) => r.dayOfMonth ?? wibDateParts(r.startDay).date;

/** Hari WIB tanggal `anchor` di bulan ke-`index` (tahun*12 + bulan-1), dijepit ke akhir bulan. */
export function anchoredDay(index: number, anchor: number) {
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return wibDayOf(year, month, Math.min(anchor, daysInMonth(year, month)));
}

/** Senin = 1 … Minggu = 7. */
export const isoWeekday = (day: number) => ((wibDayDate(day).getUTCDay() + 6) % 7) + 1;

/**
 * Jatuh tempo ke-k menurut jadwal (k = 0 di bulan/minggu startDay). Tanggal selalu dihitung dari
 * dayOfMonth, bukan dari tanggal sebelumnya yang sudah dijepit: 31 Jan → 28 Feb → 31 Mar.
 */
export function occurrenceAt(r: RecurrenceRule, k: number) {
  if (r.frequency === "weekly") return r.startDay + k * 7 * r.every;
  const s = wibDateParts(r.startDay);
  return anchoredDay(monthIndex(s.year, s.month) + k * monthStep(r), anchorOf(r));
}

/** Jatuh tempo pertama ≥ `day` (dan ≥ startDay). */
export function firstOnOrAfter(r: RecurrenceRule, day: number) {
  const from = Math.max(day, r.startDay);
  if (r.frequency === "weekly") {
    const step = 7 * r.every;
    return r.startDay + Math.ceil((from - r.startDay) / step) * step;
  }
  const s = wibDateParts(r.startDay);
  const p = wibDateParts(from);
  let k = Math.max(0, Math.floor((monthIndex(p.year, p.month) - monthIndex(s.year, s.month)) / monthStep(r)));
  let d = occurrenceAt(r, k);
  while (d < from) d = occurrenceAt(r, ++k);
  return d;
}

export const nextAfter = (r: RecurrenceRule, day: number) => firstOnOrAfter(r, day + 1);
export const isOccurrence = (r: RecurrenceRule, day: number) => day >= r.startDay && firstOnOrAfter(r, day) === day;

/** Hari pertama yang sesuai jadwal mulai `fromDay` untuk aturan baru (menjadi startDay). */
export function alignStart(frequency: Frequency, dayOfMonth: number | null, fromDay: number) {
  if (frequency === "weekly" || dayOfMonth === null) return fromDay;
  const p = wibDateParts(fromDay);
  const index = monthIndex(p.year, p.month);
  const d = anchoredDay(index, dayOfMonth);
  return d >= fromDay ? d : anchoredDay(index + (frequency === "yearly" ? 12 : 1), dayOfMonth);
}

/**
 * Jatuh tempo di [fromDay, today], paling lama dulu, maks `limit`, dan tidak lebih dari `remaining`
 * (sisa cicilan; null = tanpa akhir).
 */
export function dueBetween(r: RecurrenceRule, fromDay: number, today: number, limit = MAX_CATCH_UP, remaining: number | null = null) {
  const max = remaining === null ? limit : Math.min(limit, Math.max(0, remaining));
  const out: number[] = [];
  for (let d = firstOnOrAfter(r, fromDay); d <= today && out.length < max; d = nextAfter(r, d)) out.push(d);
  return out;
}

/** Jatuh tempo di [from, to]. */
export function occurrencesInRange(r: RecurrenceRule, from: number, to: number, limit = 62) {
  const out: number[] = [];
  for (let d = firstOnOrAfter(r, from); d <= to && out.length < limit; d = nextAfter(r, d)) out.push(d);
  return out;
}

// ── Status & tampilan ────────────────────────────────────────────────────────

/** Bentuk aturan yang dikirim ke browser (snapshot.recurring.rules). */
export interface RecurringView extends RecurrenceRule {
  id: number;
  kind: RecurringKind;
  title: string;
  amount: number;
  /** label kategori tepira (expense) */
  category: string | null;
  note: string | null;
  source: "gaji" | "bonus";
  mode: RecurringMode;
  active: boolean;
  /** hari WIB jatuh tempo berikutnya yang belum jadi tagihan */
  nextDueDay: number;
  maxOccurrences: number | null;
  /** jatuh tempo yang sudah jadi tagihan (+ yang dibayar sebelum dicatat di desa) */
  occurrenceCount: number;
  walletId: number | null;
  walletName: string | null;
  goalId: number | null;
  goalTitle: string | null;
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Tagihan yang menunggu di kotak pos (RecurringOccurrence status "pending"). */
export interface BillView {
  id: number;
  recurringId: number;
  day: number;
  /** nominal yang disalin dari aturan saat tagihan dibuat; boleh diubah saat Catat */
  amount: number;
}

/** Tagihan yang dicatat otomatis belakangan ini (7 hari). */
export interface AutoPostView {
  id: number;
  recurringId: number;
  day: number;
  amount: number;
  /** ISO, kapan dicatat */
  at: string;
}

export interface RecurringData {
  /** false = tabelnya belum ada (migrasi tepira belum jalan) atau desa contoh */
  available: boolean;
  rules: RecurringView[];
  bills: BillView[];
  autoPosted: AutoPostView[];
}

export const NO_RECURRING: RecurringData = Object.freeze({
  available: false,
  rules: [],
  bills: [],
  autoPosted: []
}) as RecurringData;

/** Tanda di pengeluaran/setoran yang dibuat dari tagihan rutin. */
export interface RecurringLink {
  /** id aturan */
  id: number;
  /** dicatat otomatis (tidak menyalakan lampu streak) */
  auto: boolean;
}

type StatusFields = Pick<RecurringView, "active" | "maxOccurrences" | "occurrenceCount">;

/** Selesai = cicilan sudah habis; dijeda = dimatikan user. */
export function ruleStatus(r: StatusFields): RecurringStatus {
  if (r.maxOccurrences !== null && r.occurrenceCount >= r.maxOccurrences) return "ended";
  return r.active ? "active" : "paused";
}

export interface BillContext {
  /** dompet milik user yang masih ada */
  walletIds: ReadonlySet<number>;
  /** progres goal 0..1 per id */
  goalProgress: ReadonlyMap<number, number>;
}

export function blockReason(
  r: Pick<RecurringView, "kind" | "walletId" | "goalId">,
  ctx: BillContext
): BlockReason | null {
  if (r.kind === "expense") return r.walletId !== null && ctx.walletIds.has(r.walletId) ? null : "no-wallet";
  if (r.goalId === null || !ctx.goalProgress.has(r.goalId)) return "no-goal";
  return (ctx.goalProgress.get(r.goalId) ?? 0) >= 1 ? "goal-done" : null;
}

/**
 * Satu-satunya aturan "dicatat otomatis atau jadi tagihan" (server, cron, dan tampilan): aturan ⚡
 * otomatis yang tidak dijeda, tagihan sudah jatuh tempo dan umurnya ≤ AUTO_MAX_AGE_DAYS, tidak terhalang.
 */
export function canAutoPost(
  r: Pick<RecurringView, "mode"> & StatusFields,
  dueDay: number,
  today: number,
  blocked: BlockReason | null
) {
  return (
    r.mode === "auto" &&
    ruleStatus(r) !== "paused" &&
    blocked === null &&
    dueDay <= today &&
    today - dueDay <= AUTO_MAX_AGE_DAYS
  );
}

/** Cicilan ke berapa tagihan bertanggal `day` (null kalau aturan tanpa batas). */
export function installmentOrdinal(r: RecurringView, day: number): number | null {
  if (r.maxOccurrences === null) return null;
  const after = r.nextDueDay - 1 > day ? occurrencesInRange(r, day + 1, r.nextDueDay - 1, MAX_OCCURRENCES).length : 0;
  return Math.max(1, r.occurrenceCount - after);
}

export interface BillItem {
  bill: BillView;
  rule: RecurringView;
  blocked: BlockReason | null;
  /** 0 = jatuh tempo hari ini */
  overdueDays: number;
  ordinal: number | null;
}

/** Tagihan di kotak pos digabung dengan aturannya, paling lama dulu (lalu id aturan). */
export function billItems(data: RecurringData, ctx: BillContext, today: number): BillItem[] {
  const rules = new Map(data.rules.map((r) => [r.id, r]));
  const out: BillItem[] = [];
  for (const bill of data.bills) {
    const rule = rules.get(bill.recurringId);
    if (!rule) continue;
    out.push({
      bill,
      rule,
      blocked: blockReason(rule, ctx),
      overdueDays: today - bill.day,
      ordinal: installmentOrdinal(rule, bill.day)
    });
  }
  return out.sort((a, b) => a.bill.day - b.bill.day || a.rule.id - b.rule.id || a.bill.id - b.bill.id);
}

/** Jatuh tempo dalam `days` hari ke depan (belum jadi tagihan), satu per aturan aktif. */
export function upcomingDues(rules: readonly RecurringView[], today: number, days = UPCOMING_DAYS) {
  return rules
    .filter((r) => ruleStatus(r) === "active" && r.nextDueDay >= today && r.nextDueDay <= today + days)
    .map((r) => ({ rule: r, day: r.nextDueDay }))
    .sort((a, b) => a.day - b.day || a.rule.id - b.rule.id);
}

/**
 * Kiriman baru untuk diumumkan Pak Pos: tagihan & catatan otomatis ber-id di atas penanda (id
 * RecurringOccurrence tertinggi yang sudah diumumkan, tersimpan di akun). Belum ada penanda: semua
 * tagihan + catatan otomatis 24 jam terakhir.
 */
export function newMail(data: RecurringData, marker: number | null, now: number) {
  const bills = data.bills.filter((b) => marker === null || b.id > marker);
  const autos = data.autoPosted.filter((a) =>
    marker === null ? now - Date.parse(a.at) <= 86_400_000 : a.id > marker
  );
  const maxId = Math.max(marker ?? 0, ...data.bills.map((b) => b.id), ...data.autoPosted.map((a) => a.id));
  return { bills, autos, maxId };
}

// ── Label (tanpa nominal) ────────────────────────────────────────────────────

const WEEKDAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const WEEKDAYS_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "14 Okt" */
export function dayShort(day: number) {
  const p = wibDateParts(day);
  return `${p.date} ${MONTHS_SHORT[p.month - 1]}`;
}

/** "Sab, 14 Nov" */
export function dayLabel(day: number) {
  return `${WEEKDAYS_SHORT[wibDayDate(day).getUTCDay()]}, ${dayShort(day)}`;
}

/**
 * "tiap tgl 14", "tiap tgl 31 (atau akhir bulan)", "tiap 3 bulan, tgl 14", "tiap tahun, 14 Okt",
 * "tiap Selasa", "tiap 2 minggu, Selasa".
 */
export function scheduleLabel(r: RecurrenceRule) {
  if (r.frequency === "weekly") {
    const name = WEEKDAYS[wibDayDate(r.startDay).getUTCDay()];
    return r.every === 1 ? `tiap ${name}` : `tiap ${r.every} minggu, ${name}`;
  }
  const anchor = anchorOf(r);
  if (r.frequency === "yearly") {
    const month = MONTHS_SHORT[wibDateParts(r.startDay).month - 1];
    return `${r.every === 1 ? "tiap tahun" : `tiap ${r.every} tahun`}, ${anchor} ${month}`;
  }
  const date = anchor >= 29 ? `tgl ${anchor} (atau akhir bulan)` : `tgl ${anchor}`;
  return r.every === 1 ? `tiap ${date}` : `tiap ${r.every} bulan, ${date}`;
}

/** "hari ini" | "besok" | "kemarin" | "3 hari lagi" | "lewat 5 hari" */
export function dueLabel(day: number, today: number) {
  const d = day - today;
  if (d === 0) return "hari ini";
  if (d === 1) return "besok";
  if (d === -1) return "kemarin";
  return d > 0 ? `${d} hari lagi` : `lewat ${-d} hari`;
}

/** "ke-4 dari 12" */
export function installmentLabel(ordinal: number | null, max: number | null) {
  return ordinal === null || max === null ? null : `ke-${ordinal} dari ${max}`;
}

/** Kira-kira per bulan (mingguan: × 52/12). */
export function monthlyEquivalent(amount: number, r: Pick<RecurrenceRule, "frequency" | "every">) {
  if (r.frequency === "weekly") return Math.round((amount * 52) / 12 / r.every);
  return Math.round(amount / monthStep(r));
}

/** Pilihan frekuensi di form. Kombinasi lain (mis. dibuat lewat tepira) tetap ditampilkan apa adanya. */
export const FREQUENCY_PRESETS: { key: string; frequency: Frequency; every: number; label: string }[] = [
  { key: "weekly-1", frequency: "weekly", every: 1, label: "Tiap minggu" },
  { key: "weekly-2", frequency: "weekly", every: 2, label: "Tiap 2 minggu" },
  { key: "monthly-1", frequency: "monthly", every: 1, label: "Tiap bulan" },
  { key: "monthly-3", frequency: "monthly", every: 3, label: "Tiap 3 bulan" },
  { key: "monthly-6", frequency: "monthly", every: 6, label: "Tiap 6 bulan" },
  { key: "yearly-1", frequency: "yearly", every: 1, label: "Tiap tahun" }
];

export const presetKey = (frequency: Frequency, every: number) => `${frequency}-${every}`;

export function frequencyLabel(frequency: Frequency, every: number) {
  const preset = FREQUENCY_PRESETS.find((p) => p.key === presetKey(frequency, every));
  if (preset) return preset.label;
  return `Tiap ${every} ${frequency === "weekly" ? "minggu" : frequency === "monthly" ? "bulan" : "tahun"}`;
}

/** Nilai <input type="date"> untuk hari WIB. */
export const dayInput = (day: number) => wibDayDate(day).toISOString().slice(0, 10);

/** "yyyy-mm-dd" (tanggal kalender WIB) → hari WIB; null kalau bukan tanggal yang ada. */
export function inputDay(v: unknown): number | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return wibDayOf(y, m, d);
}

// ── Validasi isian (server; pesan tampil apa adanya di desa) ──────────────────

/** Isian form 🔁 dari browser. */
export interface RecurringInput {
  kind: RecurringKind;
  title?: string;
  amount: number;
  category?: string | null;
  note?: string | null;
  source?: string;
  walletId?: number | null;
  goalId?: number | null;
  place?: { name?: string | null; lat?: number | null; lng?: number | null } | null;
  frequency: Frequency;
  every: number;
  /** monthly/yearly; kosong = tanggal dari firstDue. 31 = selalu akhir bulan */
  dayOfMonth?: number | null;
  /** "yyyy-mm-dd" (WIB): jatuh tempo pertama / berikutnya */
  firstDue: string;
  /** jumlah cicilan; kosong = terus */
  maxOccurrences?: number | null;
  /** cicilan yang sudah dibayar sebelum dicatat di desa (hanya saat membuat) */
  paidBefore?: number | null;
  mode: RecurringMode;
}

export interface ParsedRecurring {
  kind: RecurringKind;
  /** kosong = isi default dari catatan / kategori / goal (server) */
  title: string;
  amount: number;
  category: string | null;
  note: string | null;
  source: "gaji" | "bonus";
  walletId: number | null;
  goalId: number | null;
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
  frequency: Frequency;
  every: number;
  dayOfMonth: number | null;
  /** hari WIB dari firstDue (belum diselaraskan dengan jadwal) */
  firstDueDay: number;
  maxOccurrences: number | null;
  paidBefore: number;
  mode: RecurringMode;
}

const clean = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ");
const intOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Validasi bentuk isian (tanpa database). Kepemilikan dompet/goal dicek server. */
export function parseRecurringInput(raw: unknown): ParsedRecurring {
  if (!raw || typeof raw !== "object") throw new Error("Isian tagihan rutin tidak valid.");
  const r = raw as Record<string, unknown>;
  const kind = r.kind === "saving" ? "saving" : r.kind === "expense" ? "expense" : null;
  if (!kind) throw new Error("Jenis rutin harus pengeluaran atau setoran.");

  const amount = Math.round(Number(r.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Nominal harus lebih dari 0.");
  if (amount > MAX_AMOUNT) throw new Error("Nominal terlalu besar (maksimal Rp2.147.483.647).");

  const title = clean(r.title);
  if (title.length > MAX_TITLE) throw new Error(`Nama maksimal ${MAX_TITLE} huruf.`);
  const note = clean(r.note).slice(0, MAX_NOTE) || null;

  const frequency = r.frequency === "weekly" || r.frequency === "monthly" || r.frequency === "yearly" ? r.frequency : null;
  if (!frequency) throw new Error("Frekuensi harus mingguan, bulanan, atau tahunan.");
  const every = Number(r.every ?? 1);
  if (!Number.isInteger(every) || every < 1 || every > MAX_EVERY) throw new Error(`Jarak ulang harus 1–${MAX_EVERY}.`);

  const firstDueDay = inputDay(r.firstDue);
  if (firstDueDay === null) throw new Error("Tanggal jatuh tempo tidak valid.");
  let dayOfMonth: number | null = null;
  if (frequency !== "weekly") {
    const dom = intOrNull(r.dayOfMonth);
    if (dom === null) dayOfMonth = wibDateParts(firstDueDay).date;
    else if (Number.isInteger(dom) && dom >= 1 && dom <= 31) dayOfMonth = dom;
    else throw new Error("Tanggal tagihan harus 1–31.");
  }

  const max = intOrNull(r.maxOccurrences);
  if (max !== null && (!Number.isInteger(max) || max < 1 || max > MAX_OCCURRENCES)) {
    throw new Error(`Jumlah cicilan harus 1–${MAX_OCCURRENCES}, atau kosongkan kalau terus.`);
  }
  const paid = intOrNull(r.paidBefore) ?? 0;
  if (!Number.isInteger(paid) || paid < 0 || paid > MAX_OCCURRENCES) throw new Error("Cicilan yang sudah dibayar tidak valid.");
  if (max !== null && paid >= max) throw new Error("Cicilan yang sudah dibayar harus lebih kecil dari jumlah cicilan.");

  const mode = r.mode === "auto" ? "auto" : "confirm";

  if (kind === "saving") {
    const goalId = Number(r.goalId);
    if (!Number.isInteger(goalId) || goalId <= 0) throw new Error("Goal tujuan setoran wajib dipilih.");
    return {
      kind, title, amount, category: null, note, source: "gaji", walletId: null, goalId,
      placeName: null, latitude: null, longitude: null,
      frequency, every, dayOfMonth, firstDueDay, maxOccurrences: max, paidBefore: max === null ? 0 : paid, mode
    };
  }

  const source = clean(r.source) || "gaji";
  if (source !== "gaji" && source !== "bonus") throw new Error("Sumber harus 'gaji' atau 'bonus'.");
  const walletId = Number(r.walletId);
  if (!Number.isInteger(walletId) || walletId <= 0) throw new Error("Dompet wajib dipilih.");
  const category = clean(r.category) || null;
  if (category && category.length > 120) throw new Error("Nama kategori terlalu panjang.");

  // Tempat opsional, aturan sama dengan pengeluaran biasa (parsePlace di app/village/actions.ts).
  const place = r.place && typeof r.place === "object" ? (r.place as Record<string, unknown>) : null;
  const placeName = clean(place?.name).slice(0, 120) || null;
  const lat = place?.lat == null ? Number.NaN : Number(place.lat);
  const lng = place?.lng == null ? Number.NaN : Number(place.lng);
  const valid = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  return {
    kind, title, amount, category, note, source, walletId, goalId: null,
    placeName, latitude: valid ? roundCoord(lat) : null, longitude: valid ? roundCoord(lng) : null,
    frequency, every, dayOfMonth, firstDueDay, maxOccurrences: max, paidBefore: max === null ? 0 : paid, mode
  };
}

/** Nama bawaan kalau dikosongkan: catatan, lalu kategori tanpa kurung ("Langganan"), lalu goal. */
export function defaultTitle(p: Pick<ParsedRecurring, "title" | "note" | "category">, goalTitle?: string | null) {
  const fromCategory = p.category ? p.category.replace(/\s*\(.*\)$/, "") : "";
  return (p.title || p.note || fromCategory || goalTitle || "Tagihan rutin").slice(0, MAX_TITLE);
}

/** Jadwal berubah? (frekuensi, jarak, tanggal, atau jatuh tempo berikutnya) */
export function scheduleChanged(
  cur: Pick<RecurringView, "frequency" | "every" | "dayOfMonth" | "nextDueDay">,
  next: Pick<ParsedRecurring, "frequency" | "every" | "dayOfMonth" | "firstDueDay">
) {
  return (
    cur.frequency !== next.frequency ||
    cur.every !== next.every ||
    (cur.frequency !== "weekly" && cur.dayOfMonth !== next.dayOfMonth) ||
    cur.nextDueDay !== next.firstDueDay
  );
}

/** Keputusan untuk satu tagihan di kotak pos. */
export interface BillDecision {
  /** id RecurringOccurrence */
  id: number;
  action: "pay" | "skip";
  /** nominal yang benar-benar dibayar (tagihan listrik berubah-ubah); kosong = nominal tagihan */
  amount?: number;
  /** dompet pengganti (dompet aturannya sudah dihapus) */
  walletId?: number;
  /** simpan dompet pengganti untuk tagihan berikutnya */
  remember?: boolean;
}

/** Keputusan dari browser: yang rusak ditolak dengan pesan, maks MAX_SETTLE_BATCH, id unik, paling lama dulu. */
export function parseBillDecisions(raw: unknown): BillDecision[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("Tidak ada tagihan yang dipilih.");
  if (raw.length > MAX_SETTLE_BATCH) throw new Error(`Maksimal ${MAX_SETTLE_BATCH} tagihan sekaligus.`);
  const out = new Map<number, BillDecision>();
  for (const item of raw) {
    const d = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const id = Number(d.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Tagihan tidak valid.");
    if (d.action !== "pay" && d.action !== "skip") throw new Error("Pilih Catat atau Lewati.");
    const decision: BillDecision = { id, action: d.action };
    if (d.action === "pay") {
      if (d.amount !== undefined && d.amount !== null) {
        const amount = Math.round(Number(d.amount));
        if (!Number.isFinite(amount) || amount <= 0) throw new Error("Nominal harus lebih dari 0.");
        if (amount > MAX_AMOUNT) throw new Error("Nominal terlalu besar (maksimal Rp2.147.483.647).");
        decision.amount = amount;
      }
      if (d.walletId !== undefined && d.walletId !== null) {
        const walletId = Number(d.walletId);
        if (!Number.isInteger(walletId) || walletId <= 0) throw new Error("Dompet tidak valid.");
        decision.walletId = walletId;
        decision.remember = d.remember === true;
      }
    }
    out.set(id, decision);
  }
  return [...out.values()].sort((a, b) => a.id - b.id);
}
