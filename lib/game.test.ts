import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY_MS,
  WIB_OFFSET_MS,
  computeStreak,
  goalPace,
  nextUnlock,
  previewInsight,
  wibDay,
  wibWeekStart,
  type GoalView,
  type MonthSummary
} from "./game";

const T = 20_000; // hari WIB sembarang
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

test("wibDay: 23:30 WIB masih hari yang sama, 00:10 WIB sudah besok", () => {
  const midnightWib = T * DAY_MS - WIB_OFFSET_MS; // 00:00 WIB hari T
  assert.equal(wibDay(midnightWib - 30 * 60_000), T - 1);
  assert.equal(wibDay(midnightWib + 10 * 60_000), T);
  // tanggal dari <input type=date> (tengah malam UTC) jatuh di hari WIB yang sama
  assert.equal(wibDay(new Date("2026-10-12")), wibDay(new Date("2026-10-12T16:59:00Z")));
});

test("wibWeekStart: Senin", () => {
  const monday = wibDay(new Date("2026-10-12T05:00:00Z")); // Senin 12 Okt 2026
  for (let d = monday; d < monday + 7; d++) assert.equal(wibWeekStart(d), monday);
  assert.equal(wibWeekStart(monday - 1), monday - 7);
});

test("streak kosong", () => {
  const s = computeStreak([], [], T);
  assert.equal(s.current, 0);
  assert.equal(s.todayDone, false);
  assert.equal(s.villagers, 0);
  assert.equal(s.nextVillagerIn, 7);
  assert.equal(s.week.length, 7);
  assert.equal(s.week[6].day, T);
});

test("hari ini belum tercatat: streak masih hidup sampai kemarin", () => {
  const s = computeStreak(range(T - 5, T - 1), [], T);
  assert.equal(s.current, 5);
  assert.equal(s.todayDone, false);
  assert.equal(s.nextVillagerIn, 2);
});

test("bolong kemarin = streak putus", () => {
  const s = computeStreak([T - 3, T - 2, T], [], T);
  assert.equal(s.current, 1);
  assert.equal(s.longest, 2);
});

test("nol pengeluaran menyambung streak", () => {
  const s = computeStreak([T - 3, T - 1, T], [T - 2], T);
  assert.equal(s.current, 4);
  assert.equal(s.week[4].noSpend, true);
  assert.equal(s.week[4].recorded, false);
});

test("hari tercatat + ditandai nol: dihitung tercatat, bukan nol", () => {
  const s = computeStreak([T], [T], T);
  assert.equal(s.week[6].recorded, true);
  assert.equal(s.week[6].noSpend, false);
});

test("warga: tiap kelipatan 7 per deret, menetap setelah deret putus", () => {
  // deret 14 hari (2 warga), bolong, deret 9 hari (1 warga)
  const s = computeStreak([...range(T - 40, T - 27), ...range(T - 8, T)], [], T);
  assert.equal(s.villagers, 3);
  assert.equal(s.longest, 14);
  assert.equal(s.current, 9);
  assert.equal(s.nextVillagerIn, 5);
});

test("warga maksimal 8", () => {
  const s = computeStreak(range(T - 99, T), [], T);
  assert.equal(s.villagers, 8);
  assert.equal(s.nextVillagerIn, 0);
});

test("catatan bertanggal masa depan diabaikan", () => {
  const s = computeStreak([T + 1, T + 2], [T + 3], T);
  assert.equal(s.current, 0);
  assert.equal(s.villagers, 0);
});

test("bangunan berikutnya", () => {
  assert.equal(nextUnlock(1)?.key, "dermaga");
  assert.equal(nextUnlock(4)?.key, "pasar");
  assert.equal(nextUnlock(39)?.key, "balon");
  assert.equal(nextUnlock(40), null);
});

const now = Date.parse("2026-10-12T07:00:00Z");
const iso = (daysFromNow: number) => new Date(now + daysFromNow * DAY_MS).toISOString();
const goal = (g: Partial<GoalView>): GoalView => ({
  id: 1,
  title: "x",
  description: null,
  targetAmount: 10_000_000,
  deadline: null,
  createdAt: iso(-100),
  saved: 0,
  progress: 0,
  contributions: [],
  ...g
});

test("pace: tanpa target & selesai", () => {
  assert.equal(goalPace(goal({}), now).status, "none");
  assert.equal(goalPace(goal({ saved: 10_000_000, progress: 1, deadline: iso(10) }), now).status, "done");
});

test("pace: telat (di bawah garis, tidak ada setoran belakangan)", () => {
  // dibuat 100 hari lalu, target 100 hari lagi → seharusnya 50%, baru 10%
  const p = goalPace(goal({ deadline: iso(100), saved: 1_000_000, progress: 0.1 }), now);
  assert.equal(p.status, "behind");
  assert.equal(p.catchingUp, false);
  assert.ok(Math.abs(p.expected - 0.5) < 0.01);
  // sisa 9 jt / 101 hari × 7 ≈ 623.763 → dibulatkan ke atas 624.000
  assert.equal(p.perWeek, 624_000);
});

test("pace: di bawah garis tapi setoran 4 minggu terakhir cukup → mengejar, bukan telat", () => {
  const p = goalPace(
    goal({
      deadline: iso(100),
      saved: 4_000_000,
      progress: 0.4,
      contributions: [{ id: 1, amount: 2_500_000, note: null, date: iso(-10) }]
    }),
    now
  );
  assert.equal(p.status, "ontrack");
  assert.equal(p.catchingUp, true);
});

test("pace: goal baru dibuat hari ini tidak langsung telat", () => {
  assert.equal(goalPace(goal({ createdAt: iso(0), deadline: iso(60) }), now).status, "ontrack");
});

test("pace: lebih cepat", () => {
  assert.equal(goalPace(goal({ deadline: iso(100), saved: 8_000_000, progress: 0.8 }), now).status, "ahead");
});

test("pace: target hari ini & lewat target", () => {
  const today = goalPace(goal({ deadline: iso(0), saved: 9_000_000, progress: 0.9 }), now);
  assert.equal(today.daysLeft, 0);
  assert.equal(today.perWeek, 1_000_000); // dibatasi sisa
  const late = goalPace(goal({ deadline: iso(-5), saved: 9_000_000, progress: 0.9 }), now);
  assert.equal(late.status, "overdue");
  assert.equal(late.daysLeft, -5);
});

test("pratinjau surat mengikuti angka ringkasan", () => {
  const summary = {
    month: 10,
    year: 2026,
    startingBalance: 0,
    income: { salary: 10_000_000, bonus: 0, total: 10_000_000 },
    savingsAllocation: 0,
    expenses: { total: 0, count: 0 },
    budget: { limit: 0, remaining: 0, status: "NO_BUDGET" },
    savedThisMonth: 0,
    savingsRate: 25,
    byCategory: {},
    health: {
      score: 88,
      status: "SANGAT SEHAT",
      savingScore: 100,
      budgetDiscipline: 95,
      runwayMonths: 4,
      runwayScore: 100,
      debtScore: 70
    }
  } satisfies MonthSummary;
  const p = previewInsight(summary, 1_500_000);
  assert.match(p.summary, /88\/100 \(SANGAT SEHAT\)/);
  assert.match(p.summary, /rasio kewajiban 15% dari pemasukan/);
  assert.equal(p.recommendations.length, 4);
  assert.match(p.recommendations[0], /masa depanmu/);
  assert.match(p.recommendations[3], /Kurangi kewajiban/);
});
