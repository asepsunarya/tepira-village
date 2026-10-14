import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DAY_MS, WIB_OFFSET_MS, wibDay } from "./game";
import {
  BILL_NAG_DAYS,
  CRON_CLEANUP_RESERVE_MS,
  CRON_MAX_DURATION_S,
  CRON_PATHS,
  CRON_POSTMAN,
  CRON_REMINDERS,
  CRON_SEND_BUDGET_MS,
  NO_BILLS,
  SEND_TIMEOUT_MS,
  billNoun,
  buildBillDigests,
  classifyPushStatus,
  planReminders,
  reminderMessage,
  secondsUntilWibMidnight,
  sendAll,
  summarizeDeliveries,
  testMessage,
  topicFor,
  panelForBuka,
  ttlFor,
  wibDayRange,
  type BillDigest,
  type DeliveryResult,
  type PlanInput,
  type PushJob,
  type PushPayload,
  type ReminderKind,
  type ReminderPrefRow
} from "./reminders";

/** Waktu WIB → epoch ms (WIB = UTC+7, tanpa DST). */
const wib = (iso: string) => Date.parse(`${iso}+07:00`);
const TODAY = wibDay(wib("2026-10-14T20:15:00"));

const pref = (userId: string, extra: Partial<ReminderPrefRow> = {}): ReminderPrefRow => ({
  userId,
  lampReminder: true,
  billReminder: true,
  lampSentOn: null,
  billSentOn: null,
  ...extra
});
const bills = (d: Partial<BillDigest>): BillDigest => ({ ...NO_BILLS, ...d });
const plan = (over: Partial<PlanInput>) =>
  planReminders({
    job: "reminders",
    today: TODAY,
    prefs: [pref("u1")],
    bills: new Map(),
    recordedToday: new Set(),
    noSpendToday: new Set(),
    ...over
  });
const kindsOf = (over: Partial<PlanInput>, userId = "u1") => plan(over).find((p) => p.userId === userId)?.kinds ?? [];

test("vercel.json: dua cron sesuai konstanta (07:xx & 20:xx WIB)", () => {
  const json = JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as {
    crons: { path: string; schedule: string }[];
  };
  assert.deepEqual(
    json.crons.map((c) => [c.path, c.schedule]),
    [
      [CRON_PATHS.postman, CRON_POSTMAN],
      [CRON_PATHS.reminders, CRON_REMINDERS]
    ]
  );
  // Jam UTC → WIB.
  assert.equal((Number(CRON_POSTMAN.split(" ")[1]) + 7) % 24, 7);
  assert.equal((Number(CRON_REMINDERS.split(" ")[1]) + 7) % 24, 20);
});

test("wibDayRange & secondsUntilWibMidnight: batas hari WIB", () => {
  const { start, end } = wibDayRange(TODAY);
  assert.equal(start.getTime(), wib("2026-10-14T00:00:00"));
  assert.equal(end.getTime(), wib("2026-10-15T00:00:00"));
  assert.equal(wibDay(start), TODAY);
  assert.equal(wibDay(wib("2026-10-14T23:59:59.999")), TODAY);
  assert.equal(wibDay(end), TODAY + 1);
  assert.equal(end.getTime() - start.getTime(), DAY_MS);
  assert.equal(start.getTime(), TODAY * DAY_MS - WIB_OFFSET_MS);

  assert.equal(secondsUntilWibMidnight(wib("2026-10-14T20:00:00")), 4 * 3600);
  assert.equal(secondsUntilWibMidnight(wib("2026-10-14T07:00:00")), 17 * 3600);
  assert.equal(secondsUntilWibMidnight(wib("2026-10-14T23:59:30")), 60);
});

test("buildBillDigests: pending, baru (≤3 hari), lewat, setoran, otomatis hari ini", () => {
  const d = buildBillDigests(
    {
      pendingByDay: [
        { userId: "a", day: TODAY, count: 2 },
        { userId: "a", day: TODAY - 1, count: 1 },
        { userId: "a", day: TODAY - BILL_NAG_DAYS, count: 1 },
        { userId: "a", day: TODAY - BILL_NAG_DAYS - 1, count: 3 },
        { userId: "a", day: TODAY + 1, count: 9 }, // masa depan: diabaikan
        { userId: "b", day: TODAY - 30, count: 1 }
      ],
      pendingSavings: [
        { userId: "a", count: 2 },
        { userId: "b", count: 5 } // tidak boleh melebihi pending
      ],
      autoToday: [{ userId: "c", count: 2 }]
    },
    TODAY
  );
  assert.deepEqual(d.get("a"), { pending: 7, recent: 4, overdue: 5, savings: 2, autoToday: 0 });
  assert.deepEqual(d.get("b"), { pending: 1, recent: 0, overdue: 1, savings: 1, autoToday: 0 });
  assert.deepEqual(d.get("c"), { pending: 0, recent: 0, overdue: 0, savings: 0, autoToday: 2 });
  assert.equal(d.has("x"), false);
});

test("planReminders: lampu malam hanya kalau hari ini belum tercatat & belum ditandai nol", () => {
  assert.deepEqual(kindsOf({}), ["lamp"]);
  assert.deepEqual(kindsOf({ recordedToday: new Set(["u1"]) }), []);
  assert.deepEqual(kindsOf({ noSpendToday: new Set(["u1"]) }), []);
  assert.deepEqual(kindsOf({ prefs: [pref("u1", { lampReminder: false })] }), []);
  assert.deepEqual(kindsOf({ prefs: [pref("u1", { lampSentOn: TODAY })] }), [], "sudah dikirim hari ini");
  assert.deepEqual(kindsOf({ prefs: [pref("u1", { lampSentOn: TODAY - 1 })] }), ["lamp"], "kemarin tidak menghalangi");
  // Pagi (tukang pos) tidak pernah mengirim lampu, walaupun hari ini belum tercatat.
  assert.deepEqual(kindsOf({ job: "postman" }), []);
  // User lain tidak saling memengaruhi.
  const both = plan({ prefs: [pref("u1"), pref("u2")], recordedToday: new Set(["u2"]) });
  assert.deepEqual(
    both.map((p) => p.userId),
    ["u1"]
  );
});

test("planReminders: tagihan pagi & susulan malam, sekali per hari", () => {
  const due = new Map([["u1", bills({ pending: 2, recent: 2 })]]);
  assert.deepEqual(kindsOf({ job: "postman", bills: due }), ["bills"]);
  assert.deepEqual(plan({ job: "postman", bills: due })[0].bills, bills({ pending: 2, recent: 2 }));
  assert.deepEqual(kindsOf({ job: "postman", bills: due, prefs: [pref("u1", { billReminder: false })] }), []);
  // Pagi sudah terkirim → malam hanya lampu.
  assert.deepEqual(kindsOf({ bills: due, prefs: [pref("u1", { billSentOn: TODAY })] }), ["lamp"]);
  // Pagi terlewat (cron gagal) → malam menyusul, digabung dengan lampu.
  assert.deepEqual(kindsOf({ bills: due }), ["lamp", "bills"]);
  assert.deepEqual(kindsOf({ bills: due, recordedToday: new Set(["u1"]) }), ["bills"]);
  // Hanya tagihan lama (> BILL_NAG_DAYS) → diam; catatan otomatis hari ini → dikabari.
  assert.deepEqual(kindsOf({ job: "postman", bills: new Map([["u1", bills({ pending: 3, overdue: 3 })]]) }), []);
  assert.deepEqual(kindsOf({ job: "postman", bills: new Map([["u1", bills({ autoToday: 1 })]]) }), ["bills"]);
  assert.deepEqual(kindsOf({ job: "postman" }), []);
});

const ALL_DIGESTS: BillDigest[] = [
  bills({ pending: 1, recent: 1 }),
  bills({ pending: 3, recent: 3, overdue: 1 }),
  bills({ pending: 2, recent: 1, overdue: 2 }),
  bills({ pending: 2, recent: 2, savings: 2 }),
  bills({ pending: 4, recent: 4, savings: 1, autoToday: 2 }),
  bills({ autoToday: 3 }),
  bills({ pending: 12345, recent: 1 })
];
const ALL_KINDS: ReminderKind[][] = [["lamp"], ["bills"], ["lamp", "bills"]];

test("reminderMessage: teks per jenis, tag per hari, url desa", () => {
  const lamp = reminderMessage(["lamp"], { bills: null, today: TODAY });
  assert.equal(lamp.title, "💡 Lampu hari ini belum menyala");
  assert.match(lamp.body, /nol pengeluaran/);
  assert.equal(lamp.tag, `lampu-${TODAY}`);
  assert.equal(lamp.url, "/village?buka=desa");
  assert.equal(lamp.kind, "lamp");

  const due = reminderMessage(["bills"], { bills: bills({ pending: 2, recent: 2 }), today: TODAY });
  assert.equal(due.title, "📬 Tukang pos membawa 2 tagihan");
  assert.match(due.body, /^Jatuh tempo hari ini\./);
  assert.equal(due.tag, `pos-${TODAY}`);
  assert.equal(due.url, "/village?buka=pos");

  assert.match(reminderMessage(["bills"], { bills: bills({ pending: 2, overdue: 2, recent: 1 }), today: TODAY }).body, /^Sudah lewat/);
  assert.match(reminderMessage(["bills"], { bills: bills({ pending: 3, overdue: 1, recent: 3 }), today: TODAY }).body, /^1 di antaranya/);
  assert.match(
    reminderMessage(["bills"], { bills: bills({ pending: 1, recent: 1, autoToday: 2 }), today: TODAY }).body,
    /2 lainnya sudah dicatat otomatis/
  );
  const autoOnly = reminderMessage(["bills"], { bills: bills({ autoToday: 3 }), today: TODAY });
  assert.equal(autoOnly.title, "📬 Tukang pos sudah mampir");
  assert.match(autoOnly.body, /^3 kiriman rutin/);

  const both = reminderMessage(["lamp", "bills"], { bills: bills({ pending: 2, recent: 2 }), today: TODAY });
  assert.equal(both.kind, "both");
  assert.equal(both.title, "💡 Lampu hari ini belum menyala");
  assert.match(both.body, /^Tukang pos juga membawa 2 tagihan\./);
  assert.equal(both.tag, `pengingat-${TODAY}`);

  assert.equal(billNoun({ pending: 2, savings: 0 }), "tagihan");
  assert.equal(billNoun({ pending: 2, savings: 2 }), "setoran rutin");
  assert.equal(billNoun({ pending: 3, savings: 1 }), "kiriman");
});

test("reminderMessage: privasi, tanpa nominal; APP_PIN = umum tanpa jumlah", () => {
  const all: PushPayload[] = [testMessage()];
  for (const kinds of ALL_KINDS) {
    for (const d of ALL_DIGESTS) {
      all.push(reminderMessage(kinds, { bills: d, today: TODAY }));
      const generic = reminderMessage(kinds, { bills: d, today: TODAY, generic: true });
      assert.doesNotMatch(`${generic.title} ${generic.body}`, /\d/, "mode PIN tanpa angka sama sekali");
      assert.equal(generic.url, reminderMessage(kinds, { bills: d, today: TODAY }).url);
      all.push(generic);
    }
  }
  for (const m of all) {
    assert.doesNotMatch(`${m.title} ${m.body}`, /Rp|\d{1,3}\.\d{3}|rupiah/i);
    assert.match(m.url, /^\/village(\?|$)/);
    assert.equal(m.v, 1);
    assert.ok(m.title.length > 0 && m.body.length > 0);
  }
});

test("topicFor & ttlFor", () => {
  for (const m of [testMessage(), ...ALL_KINDS.map((k) => reminderMessage(k, { bills: ALL_DIGESTS[0], today: TODAY }))]) {
    assert.match(topicFor(m), /^[A-Za-z0-9_-]{1,32}$/);
  }
  assert.equal(topicFor({ tag: "x".repeat(50) }).length, 32);
  assert.equal(topicFor({ tag: "!!!" }), "tepira");
  const evening = wib("2026-10-14T20:10:00");
  const morning = wib("2026-10-14T07:10:00");
  assert.equal(ttlFor("lamp", evening), secondsUntilWibMidnight(evening));
  assert.equal(ttlFor("both", evening), secondsUntilWibMidnight(evening));
  assert.equal(ttlFor("bills", morning), 12 * 3600);
  assert.equal(ttlFor("bills", evening), secondsUntilWibMidnight(evening));
  assert.equal(ttlFor("test", evening), 3600);
});

test("classifyPushStatus: 404/410/401/403 dihapus, gangguan sementara dicoba lagi", () => {
  for (const s of [404, 410, 401, 403]) assert.deepEqual(classifyPushStatus(s), { delivery: "gone", retry: false });
  for (const s of [undefined, 408, 429, 500, 502, 503]) assert.deepEqual(classifyPushStatus(s), { delivery: "failed", retry: true });
  for (const s of [400, 413]) assert.deepEqual(classifyPushStatus(s), { delivery: "failed", retry: false });
});

test("sendAll: hasil per kiriman, batas paralel, tenggat, error = gagal jaringan", async () => {
  const statuses = [201, 410, 503, 403, 400, 201, -1, 201, 201, 201];
  let inFlight = 0;
  let peak = 0;
  const results = await sendAll(
    statuses.map((s, i) => ({ i, s })),
    async ({ s }) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      if (s === -1) throw new Error("ECONNRESET");
      return s < 300 ? { ok: true, statusCode: s } : { ok: false, statusCode: s };
    },
    { concurrency: 3 }
  );
  assert.ok(peak <= 3, `paling banyak 3 sekaligus, tercatat ${peak}`);
  assert.deepEqual(
    results.map((r) => [r.delivery, r.retry]),
    [
      ["sent", false],
      ["gone", false],
      ["failed", true],
      ["gone", false],
      ["failed", false],
      ["sent", false],
      ["failed", true],
      ["sent", false],
      ["sent", false],
      ["sent", false]
    ]
  );

  // Tenggat lewat: tidak ada kiriman baru, semuanya "skipped" (dicoba lagi nanti).
  let calls = 0;
  const late = await sendAll(
    [1, 2, 3],
    async () => {
      calls++;
      return { ok: true };
    },
    { deadline: 100, clock: () => 200 }
  );
  assert.equal(calls, 0);
  assert.deepEqual(
    late.map((r) => r.delivery),
    ["skipped", "skipped", "skipped"]
  );
  assert.deepEqual(await sendAll([], async () => ({ ok: true })), []);
});

test("summarizeDeliveries: hapus, hitung gagal, kembalikan klaim kalau tidak satu pun sampai", () => {
  const r = (subscriptionId: number, userId: string, delivery: DeliveryResult<PushJob>["delivery"], retry = false, kinds: ReminderKind[] = ["lamp"]) => ({
    job: { subscriptionId, userId, kinds },
    delivery,
    retry
  });
  const s = summarizeDeliveries([
    r(1, "a", "sent"),
    r(2, "a", "failed", true), // a tetap dapat di perangkat lain → tidak dikembalikan
    r(3, "b", "failed", true, ["lamp", "bills"]),
    r(4, "b", "gone"),
    r(5, "c", "gone"), // langganan hilang semua → tidak ada yang bisa dicoba lagi
    r(6, "d", "failed", false), // 400: dicoba lagi pun sama
    r(7, "e", "skipped", true, ["bills"])
  ]);
  assert.deepEqual(s.sentIds, [1]);
  assert.deepEqual(s.goneIds, [4, 5]);
  assert.deepEqual(s.failedIds, [2, 3, 6]);
  assert.deepEqual(
    [...s.rollback].map(([u, k]) => [u, [...k].sort()]),
    [
      ["b", ["bills", "lamp"]],
      ["e", ["bills"]]
    ]
  );
});

test("panelForBuka: ?buka= dari notifikasi → panel", () => {
  assert.equal(panelForBuka("pos"), "letter");
  assert.equal(panelForBuka("desa"), "village");
  assert.equal(panelForBuka("apa-saja"), "village");
  assert.equal(panelForBuka(""), null);
  assert.equal(panelForBuka(null), null);
  for (const kinds of ALL_KINDS) {
    const url = new URL(reminderMessage(kinds, { bills: ALL_DIGESTS[0], today: TODAY }).url, "https://desa.contoh.id");
    assert.equal(panelForBuka(url.searchParams.get("buka")), kinds.includes("bills") ? "letter" : "village");
  }
});

test("anggaran waktu cron: kiriman terakhir + beres-beres selesai sebelum maxDuration (#19)", () => {
  // Kiriman terakhir dimulai paling lambat di CRON_SEND_BUDGET_MS dan bisa macet SEND_TIMEOUT_MS; sesudahnya
  // 4–6 tulis (sent/gone/failed/rollback) + cold start. Dulu 50 dtk + 10 dtk = tepat 60: tanpa sisa.
  assert.ok(CRON_SEND_BUDGET_MS + SEND_TIMEOUT_MS + CRON_CLEANUP_RESERVE_MS <= CRON_MAX_DURATION_S * 1000);
  assert.ok(CRON_CLEANUP_RESERVE_MS >= 5_000);
  assert.equal(CRON_SEND_BUDGET_MS, 40_000);
  // maxDuration di route harus literal (konfigurasi segmen Next); keduanya harus sama dengan konstanta.
  for (const job of ["postman", "reminders"]) {
    const src = readFileSync(path.join(process.cwd(), "app/api/cron", job, "route.ts"), "utf8");
    assert.match(src, new RegExp(`export const maxDuration = ${CRON_MAX_DURATION_S};`), job);
  }
});
