import { test } from "node:test";
import assert from "node:assert/strict";
import { wibDay } from "./game";
import { wibDayOf } from "./season";
import {
  AUTO_MAX_AGE_DAYS,
  alignStart,
  autoPostPrecheck,
  billItems,
  blockReason,
  canAutoPost,
  dayInput,
  dayLabel,
  defaultTitle,
  dueBetween,
  dueLabel,
  firstOnOrAfter,
  formDayOfMonth,
  hasUnannouncedBills,
  inputDay,
  installmentLabel,
  installmentOrdinal,
  isOccurrence,
  isoWeekday,
  monthlyEquivalent,
  newMail,
  nextAfter,
  occurrencesInRange,
  parseBillDecisions,
  parseRecurringInput,
  rescheduledNextDue,
  ruleStatus,
  scheduleChanged,
  scheduleLabel,
  snapshotFromEarlierDay,
  upcomingDues,
  type RecurrenceRule,
  type RecurringData,
  type RecurringView
} from "./recurring";

const D = (y: number, m: number, d: number) => wibDayOf(y, m, d);
const iso = (days: number[]) => days.map(dayInput);

const monthly = (start: number, dayOfMonth: number, every = 1): RecurrenceRule => ({
  frequency: "monthly",
  every,
  dayOfMonth,
  startDay: start
});

function seq(r: RecurrenceRule, n: number) {
  const out = [r.startDay];
  while (out.length < n) out.push(nextAfter(r, out[out.length - 1]));
  return out;
}

function view(over: Partial<RecurringView> = {}): RecurringView {
  return {
    id: 1,
    kind: "expense",
    title: "Spotify",
    amount: 54_900,
    category: "Langganan (Spotify, Netflix, dll)",
    note: null,
    source: "gaji",
    mode: "confirm",
    active: true,
    frequency: "monthly",
    every: 1,
    dayOfMonth: 14,
    startDay: D(2026, 1, 14),
    nextDueDay: D(2026, 11, 14),
    maxOccurrences: null,
    occurrenceCount: 10,
    walletId: 7,
    walletName: "BCA",
    goalId: null,
    goalTitle: null,
    placeName: null,
    latitude: null,
    longitude: null,
    ...over
  };
}

const ctx = { walletIds: new Set([7]), goalProgress: new Map([[3, 0.4], [4, 1]]) };

test("bulanan tgl 31: dijepit ke akhir bulan tanpa bergeser", () => {
  assert.deepEqual(iso(seq(monthly(D(2026, 1, 31), 31), 6)), [
    "2026-01-31",
    "2026-02-28",
    "2026-03-31",
    "2026-04-30",
    "2026-05-31",
    "2026-06-30"
  ]);
});

test("tahunan 29 Feb: 28 Feb di tahun biasa, 29 Feb di tahun kabisat", () => {
  const r: RecurrenceRule = { frequency: "yearly", every: 1, dayOfMonth: 29, startDay: D(2028, 2, 29) };
  assert.deepEqual(iso(seq(r, 5).slice(1)), ["2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
  // sama dengan bulanan tiap 12
  assert.deepEqual(seq(r, 5), seq(monthly(D(2028, 2, 29), 29, 12), 5));
});

test("tgl 29 di Februari biasa: 28 Feb lalu kembali ke 29 Mar", () => {
  const r = monthly(D(2027, 1, 29), 29);
  assert.deepEqual(iso(seq(r, 3).slice(1)), ["2027-02-28", "2027-03-29"]);
});

test("nextAfter dari hari yang dijepit tetap memakai tanggal asli", () => {
  const r = monthly(D(2026, 1, 31), 31);
  assert.equal(dayInput(nextAfter(r, D(2026, 2, 28))), "2026-03-31");
});

test("tiap 3 bulan: fase dari startDay", () => {
  const r = monthly(D(2026, 1, 15), 15, 3);
  assert.equal(dayInput(firstOnOrAfter(r, D(2026, 2, 1))), "2026-04-15");
  assert.equal(dayInput(firstOnOrAfter(r, D(2026, 4, 15))), "2026-04-15");
  assert.equal(dayInput(nextAfter(r, D(2026, 4, 15))), "2026-07-15");
});

test("mingguan tiap 2 minggu: dueBetween", () => {
  const r: RecurrenceRule = { frequency: "weekly", every: 2, dayOfMonth: null, startDay: D(2026, 10, 13) };
  assert.deepEqual(iso(dueBetween(r, r.startDay, D(2026, 11, 30))), ["2026-10-13", "2026-10-27", "2026-11-10", "2026-11-24"]);
  assert.equal(isoWeekday(D(2026, 10, 13)), 2); // Selasa
});

test("tagihan tertunda: tgl 31 dari 31 Agu sampai 14 Okt", () => {
  const r = monthly(D(2026, 1, 31), 31);
  const due = dueBetween(r, D(2026, 8, 31), D(2026, 10, 14));
  assert.deepEqual(iso(due), ["2026-08-31", "2026-09-30"]);
  assert.equal(dayInput(nextAfter(r, due[1])), "2026-10-31");
});

test("firstOnOrAfter: hari sesuai jadwal = dirinya, sebelum startDay = startDay", () => {
  const r = monthly(D(2026, 3, 10), 10);
  assert.equal(firstOnOrAfter(r, D(2026, 5, 10)), D(2026, 5, 10));
  assert.equal(firstOnOrAfter(r, D(2025, 12, 1)), r.startDay);
  assert.equal(firstOnOrAfter(r, D(2026, 5, 11)), D(2026, 6, 10));
});

test("alignStart", () => {
  assert.equal(dayInput(alignStart("monthly", 20, D(2026, 11, 25))), "2026-12-20");
  assert.equal(dayInput(alignStart("monthly", 31, D(2026, 11, 10))), "2026-11-30");
  assert.equal(dayInput(alignStart("monthly", 14, D(2026, 10, 14))), "2026-10-14");
  assert.equal(dayInput(alignStart("yearly", 5, D(2026, 10, 14))), "2027-10-05");
  assert.equal(dayInput(alignStart("weekly", null, D(2026, 10, 14))), "2026-10-14");
});

test("isOccurrence menolak hari di luar jadwal, menerima hari yang dijepit", () => {
  const r = monthly(D(2026, 1, 31), 31);
  assert.equal(isOccurrence(r, D(2026, 2, 28)), true);
  assert.equal(isOccurrence(r, D(2026, 2, 27)), false);
  assert.equal(isOccurrence(r, D(2025, 12, 31)), false); // sebelum startDay
});

test("batas hari WIB: tagihan 14 Okt sudah jatuh tempo pukul 00:30 WIB", () => {
  assert.equal(wibDay(Date.parse("2026-10-13T17:30:00Z")), D(2026, 10, 14));
  assert.equal(wibDay(Date.parse("2026-10-13T16:59:00Z")), D(2026, 10, 13));
  const r = monthly(D(2026, 1, 14), 14);
  assert.deepEqual(iso(dueBetween(r, D(2026, 10, 14), wibDay(Date.parse("2026-10-13T17:30:00Z")))), ["2026-10-14"]);
  assert.deepEqual(dueBetween(r, D(2026, 10, 14), wibDay(Date.parse("2026-10-13T16:59:00Z"))), []);
});

test("dueBetween: sisa cicilan & batas per putaran", () => {
  const r = monthly(D(2026, 1, 5), 5);
  assert.equal(dueBetween(r, r.startDay, D(2026, 12, 31), 12, 1).length, 1);
  assert.deepEqual(dueBetween(r, r.startDay, D(2026, 12, 31), 12, 0), []);
  const weekly: RecurrenceRule = { frequency: "weekly", every: 1, dayOfMonth: null, startDay: D(2025, 9, 1) };
  assert.equal(dueBetween(weekly, weekly.startDay, D(2026, 10, 14)).length, 12);
  assert.equal(dueBetween(weekly, weekly.startDay, D(2026, 10, 14), 13).length, 13);
});

test("occurrencesInRange untuk bulan yang dilihat", () => {
  const r: RecurrenceRule = { frequency: "weekly", every: 1, dayOfMonth: null, startDay: D(2026, 9, 1) };
  assert.equal(occurrencesInRange(r, D(2026, 10, 1), D(2026, 10, 31)).length, 4); // Selasa 6,13,20,27
});

test("status: dijeda, selesai (cicilan habis), aktif", () => {
  assert.equal(ruleStatus({ active: true, maxOccurrences: null, occurrenceCount: 99 }), "active");
  assert.equal(ruleStatus({ active: false, maxOccurrences: null, occurrenceCount: 3 }), "paused");
  assert.equal(ruleStatus({ active: false, maxOccurrences: 12, occurrenceCount: 12 }), "ended");
  assert.equal(ruleStatus({ active: false, maxOccurrences: 12, occurrenceCount: 4 }), "paused");
});

test("blockReason", () => {
  assert.equal(blockReason({ kind: "expense", walletId: 7, goalId: null }, ctx), null);
  assert.equal(blockReason({ kind: "expense", walletId: 8, goalId: null }, ctx), "no-wallet");
  assert.equal(blockReason({ kind: "expense", walletId: null, goalId: 3 }, ctx), "no-wallet");
  assert.equal(blockReason({ kind: "saving", walletId: null, goalId: null }, ctx), "no-goal");
  assert.equal(blockReason({ kind: "saving", walletId: null, goalId: 3 }, ctx), null);
  assert.equal(blockReason({ kind: "saving", walletId: null, goalId: 4 }, ctx), "goal-done");
  assert.equal(blockReason({ kind: "saving", walletId: null, goalId: 99 }, ctx), "no-goal");
});

test("canAutoPost: otomatis hanya ≤35 hari, tidak dijeda, tidak terhalang", () => {
  const today = D(2026, 10, 14);
  const auto = { mode: "auto" as const, active: true, maxOccurrences: null, occurrenceCount: 1 };
  assert.equal(canAutoPost(auto, today, today, null), true);
  assert.equal(canAutoPost(auto, today - AUTO_MAX_AGE_DAYS, today, null), true);
  assert.equal(canAutoPost(auto, today - AUTO_MAX_AGE_DAYS - 1, today, null), false);
  assert.equal(canAutoPost(auto, today + 1, today, null), false);
  assert.equal(canAutoPost(auto, today, today, "no-wallet"), false);
  assert.equal(canAutoPost({ ...auto, mode: "confirm" }, today, today, null), false);
  assert.equal(canAutoPost({ ...auto, active: false }, today, today, null), false);
  // cicilan terakhir yang sudah jadi tagihan tetap dicatat walau aturannya selesai
  assert.equal(canAutoPost({ ...auto, active: false, maxOccurrences: 12, occurrenceCount: 12 }, today, today, null), true);
});

test("billItems: urut hari lalu id aturan, ikut status terhalang & cicilan ke-", () => {
  const today = D(2026, 10, 14);
  const hp = view({ id: 2, title: "Cicilan HP", dayOfMonth: 5, startDay: D(2026, 3, 5), nextDueDay: D(2026, 11, 5), maxOccurrences: 12, occurrenceCount: 8 });
  const kos = view({ id: 1, title: "Kos", walletId: 99, dayOfMonth: 12, startDay: D(2026, 1, 12), nextDueDay: D(2026, 11, 12) });
  const data: RecurringData = {
    available: true,
    rules: [hp, kos],
    bills: [
      { id: 11, recurringId: 1, day: D(2026, 10, 12), amount: 1_500_000 },
      { id: 9, recurringId: 2, day: D(2026, 9, 5), amount: 300_000 },
      { id: 10, recurringId: 2, day: D(2026, 10, 5), amount: 300_000 },
      { id: 12, recurringId: 404, day: D(2026, 10, 1), amount: 1 }
    ],
    autoPosted: []
  };
  const items = billItems(data, ctx, today);
  assert.deepEqual(items.map((i) => i.bill.id), [9, 10, 11]);
  assert.deepEqual(items.map((i) => i.ordinal), [7, 8, null]);
  assert.equal(items[2].blocked, "no-wallet");
  assert.equal(items[0].overdueDays, today - D(2026, 9, 5));
  assert.equal(installmentLabel(items[1].ordinal, hp.maxOccurrences), "ke-8 dari 12");
  assert.equal(installmentOrdinal(kos, D(2026, 10, 12)), null);
});

test("upcomingDues: ≤3 hari ke depan, tanpa yang dijeda", () => {
  const today = D(2026, 10, 14);
  const rules = [
    view({ id: 1, nextDueDay: today + 2 }),
    view({ id: 2, nextDueDay: today + 4 }),
    view({ id: 3, nextDueDay: today + 1, active: false }),
    view({ id: 4, nextDueDay: today })
  ];
  assert.deepEqual(upcomingDues(rules, today).map((u) => u.rule.id), [4, 1]);
});

test("newMail: penanda id tertinggi; tanpa penanda = semua tagihan + otomatis 24 jam", () => {
  const now = Date.parse("2026-10-14T03:00:00Z");
  const data: RecurringData = {
    available: true,
    rules: [],
    bills: [
      { id: 5, recurringId: 1, day: 1, amount: 1 },
      { id: 8, recurringId: 1, day: 2, amount: 1 }
    ],
    autoPosted: [
      { id: 7, recurringId: 2, day: 2, amount: 1, at: "2026-10-14T00:00:00Z" },
      { id: 3, recurringId: 2, day: 1, amount: 1, at: "2026-10-10T00:00:00Z" }
    ]
  };
  const first = newMail(data, null, now);
  assert.deepEqual([first.bills.map((b) => b.id), first.autos.map((a) => a.id), first.maxId], [[5, 8], [7], 8]);
  const later = newMail(data, 6, now);
  assert.deepEqual([later.bills.map((b) => b.id), later.autos.map((a) => a.id), later.maxId], [[8], [7], 8]);
  assert.equal(newMail(data, 20, now).maxId, 20);
  assert.equal(newMail({ ...data, bills: [], autoPosted: [] }, 20, now).bills.length, 0);
});

test("label jadwal (tanpa nominal)", () => {
  assert.equal(scheduleLabel(monthly(D(2026, 10, 14), 14)), "tiap tgl 14");
  assert.equal(scheduleLabel(monthly(D(2026, 10, 31), 31)), "tiap tgl 31 (atau akhir bulan)");
  assert.equal(scheduleLabel(monthly(D(2026, 10, 14), 14, 3)), "tiap 3 bulan, tgl 14");
  assert.equal(scheduleLabel({ frequency: "yearly", every: 1, dayOfMonth: 14, startDay: D(2026, 10, 14) }), "tiap tahun, 14 Okt");
  assert.equal(scheduleLabel({ frequency: "weekly", every: 1, dayOfMonth: null, startDay: D(2026, 10, 13) }), "tiap Selasa");
  assert.equal(scheduleLabel({ frequency: "weekly", every: 2, dayOfMonth: null, startDay: D(2026, 10, 13) }), "tiap 2 minggu, Selasa");
  assert.equal(dayLabel(D(2026, 11, 14)), "Sab, 14 Nov");
});

test("dueLabel", () => {
  const t = D(2026, 10, 14);
  assert.deepEqual(
    [0, 1, -1, 5, -5].map((d) => dueLabel(t + d, t)),
    ["hari ini", "besok", "kemarin", "5 hari lagi", "lewat 5 hari"]
  );
});

test("monthlyEquivalent", () => {
  assert.equal(monthlyEquivalent(10_000, { frequency: "weekly", every: 1 }), 43_333);
  assert.equal(monthlyEquivalent(600_000, { frequency: "monthly", every: 3 }), 200_000);
  assert.equal(monthlyEquivalent(1_200_000, { frequency: "yearly", every: 1 }), 100_000);
});

test("inputDay / dayInput", () => {
  assert.equal(inputDay("2026-02-30"), null);
  assert.equal(inputDay("2026-13-01"), null);
  assert.equal(inputDay("14-10-2026"), null);
  assert.equal(inputDay(42), null);
  assert.equal(inputDay("2026-10-14"), D(2026, 10, 14));
  assert.equal(dayInput(inputDay("2028-02-29")!), "2028-02-29");
});

test("parseRecurringInput: pengeluaran", () => {
  const p = parseRecurringInput({
    kind: "expense",
    title: "  Kos  Bu Ani ",
    amount: 1_500_000.4,
    category: "Listrik / Air / Kos",
    walletId: 7,
    frequency: "monthly",
    every: 1,
    firstDue: "2026-11-01",
    mode: "auto",
    place: { name: "Kos Bu Ani", lat: -6.123456789, lng: 107.6 }
  });
  assert.equal(p.title, "Kos Bu Ani");
  assert.equal(p.amount, 1_500_000);
  assert.equal(p.dayOfMonth, 1);
  assert.equal(p.firstDueDay, D(2026, 11, 1));
  assert.equal(p.mode, "auto");
  assert.equal(p.source, "gaji");
  assert.equal(p.latitude, -6.12346);
  assert.equal(p.paidBefore, 0);
});

test("parseRecurringInput: setoran & cicilan", () => {
  const p = parseRecurringInput({
    kind: "saving",
    amount: 100_000,
    goalId: 3,
    walletId: 7,
    category: "x",
    frequency: "weekly",
    every: 1,
    dayOfMonth: 20,
    firstDue: "2026-10-19",
    maxOccurrences: 12,
    paidBefore: 4,
    mode: "confirm"
  });
  assert.deepEqual([p.walletId, p.category, p.dayOfMonth, p.maxOccurrences, p.paidBefore], [null, null, null, 12, 4]);
  assert.equal(defaultTitle(p, "Dana darurat"), "Dana darurat");
  assert.equal(defaultTitle({ title: "", note: null, category: "Langganan (Spotify, Netflix, dll)" }), "Langganan");
});

test("parseRecurringInput: isian salah ditolak dengan pesan", () => {
  const base = { kind: "expense", amount: 10_000, walletId: 1, frequency: "monthly", every: 1, firstDue: "2026-10-14", mode: "confirm" };
  const bad: [Record<string, unknown>, RegExp][] = [
    [{ amount: 0 }, /lebih dari 0/],
    [{ amount: 3_000_000_000 }, /terlalu besar/],
    [{ kind: "toggle" }, /Jenis/],
    [{ frequency: "daily" }, /Frekuensi/],
    [{ every: 13 }, /1–12/],
    [{ firstDue: "2026-02-30" }, /tidak valid/],
    [{ dayOfMonth: 32 }, /1–31/],
    [{ walletId: 0 }, /Dompet/],
    [{ source: "warisan" }, /Sumber/],
    [{ maxOccurrences: 0 }, /cicilan/],
    [{ maxOccurrences: 4, paidBefore: 4 }, /lebih kecil/],
    [{ kind: "saving", goalId: null }, /Goal/],
    [{ title: "x".repeat(61) }, /maksimal 60/]
  ];
  for (const [patch, msg] of bad) assert.throws(() => parseRecurringInput({ ...base, ...patch }), msg, JSON.stringify(patch));
});

test("scheduleChanged", () => {
  const cur = view();
  const same = { frequency: cur.frequency, every: cur.every, dayOfMonth: cur.dayOfMonth, firstDueDay: cur.nextDueDay };
  assert.equal(scheduleChanged(cur, same), false);
  assert.equal(scheduleChanged(cur, { ...same, firstDueDay: cur.nextDueDay + 1 }), true);
  assert.equal(scheduleChanged(cur, { ...same, every: 3 }), true);
  assert.equal(scheduleChanged(cur, { ...same, dayOfMonth: 15 }), true);
  // Form yang tidak menyentuh jadwal (keepSchedule): nextDueDay basi dari tab lama bukan perubahan jadwal.
  assert.equal(scheduleChanged(cur, { ...same, firstDueDay: cur.nextDueDay - 7, keepSchedule: true }), false);
  assert.equal(scheduleChanged(cur, { ...same, every: 3, keepSchedule: true }), false);
  const base = { kind: "expense", amount: 10_000, walletId: 1, frequency: "monthly", every: 1, firstDue: "2026-10-14", mode: "confirm" };
  assert.equal(parseRecurringInput({ ...base, keepSchedule: true }).keepSchedule, true);
  assert.equal(parseRecurringInput({ ...base, keepSchedule: "ya" }).keepSchedule, false);
  assert.equal(parseRecurringInput(base).keepSchedule, false);
});

test("rescheduledNextDue: jadwal diubah setelah tagihan hari ini diantar, fase & hari pilihan tetap (#2, #9)", () => {
  const today = D(2026, 10, 14); // Rabu
  assert.equal(isoWeekday(today), 3);
  // Mingguan → tiap 2 minggu mulai hari ini, tagihan hari ini sudah ada: 28 Okt (Rabu), bukan Kamis 15 Okt.
  const weekly = { frequency: "weekly" as const, every: 2, dayOfMonth: null, firstDueDay: today };
  const w = rescheduledNextDue(weekly, today, today);
  assert.equal(w, D(2026, 10, 28));
  assert.equal(isoWeekday(w), 3);
  assert.equal(w, nextAfter({ ...weekly, startDay: today }, today));
  // Tiap 3 bulan tgl 14 mulai hari ini: 14 Jan, bukan 14 Nov (tagihan otomatis dua bulan lebih awal).
  const quarterly = { frequency: "monthly" as const, every: 3, dayOfMonth: 14, firstDueDay: today };
  assert.equal(rescheduledNextDue(quarterly, today, today), D(2027, 1, 14));
  assert.equal(rescheduledNextDue(quarterly, today, today), nextAfter({ ...quarterly, startDay: today }, today));
  // Bulanan & tahunan tetap seperti dulu.
  assert.equal(rescheduledNextDue({ frequency: "monthly", every: 1, dayOfMonth: 14, firstDueDay: today }, today, today), D(2026, 11, 14));
  assert.equal(rescheduledNextDue({ frequency: "yearly", every: 1, dayOfMonth: 14, firstDueDay: today }, today, today), D(2027, 10, 14));
  // Belum ada tagihan / tagihan terakhir lebih lama: mulai di tanggal pilihan.
  assert.equal(rescheduledNextDue(weekly, today, null), today);
  assert.equal(rescheduledNextDue(weekly, today, today - 7), today);
  // Tanggal pilihan di depan: dipakai (diselaraskan ke tanggal tagihan untuk bulanan).
  assert.equal(rescheduledNextDue({ ...weekly, firstDueDay: today + 3 }, today, today), today + 3);
  assert.equal(rescheduledNextDue({ ...quarterly, firstDueDay: D(2026, 10, 20) }, today, today), D(2026, 11, 14));
});

test("formDayOfMonth: patokan tgl 29/30 dari draft tidak jadi tgl 28 saat jatuh tempo pertama di Februari (#11, #16)", () => {
  // "Jadikan rutin" dari pengeluaran 30 Jan 2027, dibuka 5 Feb: jatuh tempo pertama dijepit ke 28 Feb.
  const expenseDay = D(2027, 1, 30);
  const firstDue = firstOnOrAfter(monthly(expenseDay, 30), Math.max(D(2027, 2, 5), expenseDay + 1));
  assert.equal(firstDue, D(2027, 2, 28));
  const dom = formDayOfMonth("monthly", false, firstDue, 30);
  assert.equal(dom, 30);
  const start = alignStart("monthly", dom, firstDue);
  assert.deepEqual(iso(seq({ frequency: "monthly", every: 1, dayOfMonth: dom, startDay: start }, 3)), [
    "2027-02-28",
    "2027-03-30",
    "2027-04-30"
  ]);
  // tgl 30 di Februari kabisat; tgl 29 di Februari biasa; tahunan 29 Feb di tahun biasa.
  assert.equal(formDayOfMonth("monthly", false, D(2028, 2, 29), 30), 30);
  assert.equal(formDayOfMonth("monthly", false, D(2027, 2, 28), 29), 29);
  assert.equal(formDayOfMonth("yearly", false, D(2027, 2, 28), 29), 29);
  // Tanggal yang dipilih sendiri (patokan tidak cocok / dilepas): tanggalnya.
  assert.equal(formDayOfMonth("monthly", false, D(2027, 3, 15), 30), 15);
  assert.equal(formDayOfMonth("monthly", false, D(2027, 2, 28), null), 28);
  assert.equal(formDayOfMonth("monthly", false, D(2027, 2, 27), 30), 27);
  // Akhir bulan & mingguan tidak berubah.
  assert.equal(formDayOfMonth("monthly", true, D(2027, 2, 28), 30), 31);
  assert.equal(formDayOfMonth("monthly", false, D(2027, 2, 28), 31), 28);
  assert.equal(formDayOfMonth("weekly", false, D(2027, 2, 28), 30), null);
});

test("autoPostPrecheck: tagihan yang pasti terhalang tidak membuka transaksi (#4)", () => {
  const today = D(2026, 10, 14);
  const auto = {
    mode: "auto" as const,
    kind: "expense" as const,
    active: true,
    maxOccurrences: null,
    occurrenceCount: 1,
    walletId: 7,
    goalId: null
  };
  assert.equal(autoPostPrecheck(auto, today, today), true);
  assert.equal(autoPostPrecheck({ ...auto, active: false }, today, today), false, "dijeda");
  assert.equal(autoPostPrecheck({ ...auto, walletId: null }, today, today), false, "dompet dihapus (SetNull)");
  assert.equal(autoPostPrecheck({ ...auto, kind: "saving", walletId: null, goalId: null }, today, today), false, "goal dihapus");
  assert.equal(autoPostPrecheck({ ...auto, kind: "saving", walletId: null, goalId: 3 }, today, today), true);
  assert.equal(autoPostPrecheck({ ...auto, mode: "confirm" }, today, today), false);
  assert.equal(autoPostPrecheck(auto, today - AUTO_MAX_AGE_DAYS - 1, today), false, "terlalu tua");
  // Jangan menyaring active:true saja: cicilan yang baru selesai tetap mencatat tagihan terakhirnya.
  assert.equal(autoPostPrecheck({ ...auto, active: false, maxOccurrences: 12, occurrenceCount: 12 }, today, today), true);
});

test("hasUnannouncedBills: tagihan di atas penanda menunggu diantar Pak Pos (#14)", () => {
  const bills = [
    { id: 5, recurringId: 1, day: 1, amount: 1 },
    { id: 9, recurringId: 1, day: 2, amount: 1 }
  ];
  const data = { available: true, bills };
  assert.equal(hasUnannouncedBills(data, null), true, "belum ada penanda = semua baru");
  assert.equal(hasUnannouncedBills(data, 5), true);
  assert.equal(hasUnannouncedBills(data, 9), false, "sudah diumumkan (mis. di perangkat lain)");
  assert.equal(hasUnannouncedBills({ available: true, bills: [] }, null), false);
  assert.equal(hasUnannouncedBills({ available: false, bills }, null), false);
});

test("snapshotFromEarlierDay: snapshot dari hari WIB sebelumnya selalu diganti (#7)", () => {
  const now = Date.parse("2026-10-14T00:30:00Z"); // 07:30 WIB
  assert.equal(snapshotFromEarlierDay("2026-10-13T16:59:00Z", now), true, "23:59 WIB kemarin");
  assert.equal(snapshotFromEarlierDay("2026-10-13T17:00:00Z", now), false, "00:00 WIB hari ini");
  assert.equal(snapshotFromEarlierDay("2026-10-14T00:29:00Z", now), false);
  assert.equal(snapshotFromEarlierDay(undefined, now), true);
  assert.equal(snapshotFromEarlierDay("bukan tanggal", now), true);
  assert.equal(snapshotFromEarlierDay(12345, now), true);
  // Waktu dari masa depan dijepit ke sekarang: tidak bisa menahan pembaruan hari ini.
  assert.equal(snapshotFromEarlierDay("2030-01-01T00:00:00Z", now), false);
});

test("parseBillDecisions", () => {
  assert.deepEqual(
    parseBillDecisions([
      { id: 9, action: "skip", amount: 5 },
      { id: 4, action: "pay", amount: "120000", walletId: 3, remember: true },
      { id: 4, action: "pay" }
    ]),
    [
      { id: 4, action: "pay" },
      { id: 9, action: "skip" }
    ]
  );
  assert.deepEqual(parseBillDecisions([{ id: 2, action: "pay", amount: 1.6, walletId: 3 }]), [
    { id: 2, action: "pay", amount: 2, walletId: 3, remember: false }
  ]);
  assert.throws(() => parseBillDecisions([]), /Tidak ada/);
  assert.throws(() => parseBillDecisions("x"), /Tidak ada/);
  assert.throws(() => parseBillDecisions([{ id: 1, action: "toggle" }]), /Catat atau Lewati/);
  assert.throws(() => parseBillDecisions([{ id: -1, action: "pay" }]), /tidak valid/);
  assert.throws(() => parseBillDecisions([{ id: 1, action: "pay", amount: 0 }]), /lebih dari 0/);
  assert.throws(() => parseBillDecisions(Array.from({ length: 25 }, (_, i) => ({ id: i + 1, action: "skip" }))), /Maksimal 24/);
});
