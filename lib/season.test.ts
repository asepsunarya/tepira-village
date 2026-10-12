import { test } from "node:test";
import assert from "node:assert/strict";
import { wibDay } from "./game";
import {
  SEASONS,
  daysInMonth,
  festivalFor,
  habitYear,
  mixHex,
  nextSeasonChange,
  seasonForMonth,
  wibDateParts,
  wibDayOf,
  yearProgress
} from "./season";

/** Hari WIB dari tanggal kalender WIB (siang, supaya jauh dari batas hari). */
const on = (date: string) => wibDay(`${date}T12:00:00+07:00`);

test("yearProgress: 13 Okt 2026 = hari ke-286 dari 365, sisa 79", () => {
  const p = yearProgress(on("2026-10-13"));
  assert.deepEqual(
    { year: p.year, dayOfYear: p.dayOfYear, daysInYear: p.daysInYear, daysLeft: p.daysLeft },
    { year: 2026, dayOfYear: 286, daysInYear: 365, daysLeft: 79 }
  );
  assert.equal(p.fraction, 286 / 365);
});

test("yearProgress: 1 Jan, 31 Des, dan tahun kabisat", () => {
  assert.equal(yearProgress(on("2026-01-01")).dayOfYear, 1);
  const last = yearProgress(on("2026-12-31"));
  assert.equal(last.dayOfYear, 365);
  assert.equal(last.daysLeft, 0);
  assert.equal(last.fraction, 1);
  const leap = yearProgress(on("2028-02-29"));
  assert.equal(leap.dayOfYear, 60);
  assert.equal(leap.daysInYear, 366);
});

test("yearProgress: batas hari WIB, 2026-12-31T17:30Z sudah 1 Januari 2027", () => {
  const p = yearProgress(wibDay("2026-12-31T17:30:00Z"));
  assert.equal(p.year, 2027);
  assert.equal(p.dayOfYear, 1);
  // 16:59Z masih 31 Desember 23:59 WIB
  assert.equal(yearProgress(wibDay("2026-12-31T16:59:00Z")).year, 2026);
});

test("wibDateParts & wibDayOf: bolak-balik, bulan meluap ke tahun berikutnya", () => {
  assert.deepEqual(wibDateParts(on("2026-10-13")), { year: 2026, month: 10, date: 13 });
  assert.equal(wibDayOf(2026, 10, 13), on("2026-10-13"));
  assert.equal(wibDayOf(2026, 13), on("2027-01-01"));
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2026, 12), 31);
});

test("nextSeasonChange: 13 Okt 2026 → hujan 1 Nov (19 hari), 15 Des 2026 → panen 1 Mar 2027", () => {
  const a = nextSeasonChange(on("2026-10-13"));
  assert.equal(a.season, "hujan");
  assert.equal(a.day, on("2026-11-01"));
  assert.equal(a.inDays, 19);
  const b = nextSeasonChange(on("2026-12-15"));
  assert.equal(b.season, "panen");
  assert.deepEqual(wibDateParts(b.day), { year: 2027, month: 3, date: 1 });
  assert.equal(b.inDays, 76);
  // hari terakhir musim: besok sudah ganti
  assert.equal(nextSeasonChange(on("2026-04-30")).inDays, 1);
  assert.equal(nextSeasonChange(on("2026-04-30")).season, "kemarau");
});

test("seasonForMonth: 12 bulan + normalisasi", () => {
  assert.deepEqual(
    Array.from({ length: 12 }, (_, i) => seasonForMonth(i + 1)),
    ["hujan", "hujan", "panen", "panen", "kemarau", "kemarau", "kemarau", "kemarau", "mangga", "mangga", "hujan", "hujan"]
  );
  assert.equal(seasonForMonth(0), "hujan"); // Desember
  assert.equal(seasonForMonth(13), "hujan"); // Januari
  assert.equal(seasonForMonth(-3), "mangga"); // September
  // daftar bulan di SEASONS cocok dengan seasonForMonth
  for (const info of Object.values(SEASONS)) for (const m of info.months) assert.equal(seasonForMonth(m), info.key);
});

test("festivalFor: Agustusan hanya di bulan Agustus", () => {
  assert.equal(festivalFor(8), "agustusan");
  assert.equal(festivalFor(20), "agustusan");
  assert.equal(festivalFor(7), null);
  assert.equal(festivalFor(9), null);
});

test("habitYear: catatan menang atas nol, masa depan tidak dihitung, sebelum mulai = before", () => {
  const today = on("2026-10-13");
  const activity = [on("2026-10-01"), on("2026-10-02"), on("2026-10-03"), on("2026-10-20")];
  const noSpend = [on("2026-10-03"), on("2026-10-05")];
  const h = habitYear(activity, noSpend, 2026, today);
  const oct = h.months[9].days;
  const sep = h.months[8].days;
  assert.equal(sep[29], "before");
  assert.equal(h.months[0].days[0], "before");
  assert.deepEqual(oct.slice(0, 6), ["recorded", "recorded", "recorded", "missed", "nospend", "missed"]);
  assert.equal(oct[12], "future"); // hari ini belum tercatat: masih terbuka
  assert.equal(oct[19], "future"); // catatan bertanggal masa depan tidak dihitung
  assert.equal(h.months[9].done, 4);
  assert.equal(h.done, 4);
  assert.equal(h.elapsed, 12); // 1–12 Okt
  assert.equal(h.longestRun, 3);
  assert.equal(h.months[9].start, on("2026-10-01"));
});

test("habitYear: hari ini yang sudah tercatat ikut dihitung; deret hanya di tahun ini", () => {
  const today = on("2027-01-02");
  const days = [on("2026-12-29"), on("2026-12-30"), on("2026-12-31"), on("2027-01-01"), on("2027-01-02")];
  const h = habitYear(days, [], 2027, today);
  assert.deepEqual(h.months[0].days.slice(0, 3), ["recorded", "recorded", "future"]);
  assert.equal(h.longestRun, 2);
  assert.equal(h.done, 2);
  assert.equal(h.elapsed, 2);
  // tahun sebelumnya: semua tanggal sudah lewat, deret 3 hari di akhir Desember
  const prev = habitYear(days, [], 2026, today);
  assert.equal(prev.longestRun, 3);
  assert.equal(prev.months[11].days[27], "before");
});

test("habitYear: Februari 28/29 hari, akun baru tanpa catatan tidak punya hari terlewat", () => {
  assert.equal(habitYear([], [], 2026, on("2026-10-13")).months[1].days.length, 28);
  const fresh = habitYear([], [], 2028, on("2028-03-10"));
  assert.equal(fresh.months[1].days.length, 29);
  assert.equal(fresh.done, 0);
  assert.equal(fresh.elapsed, 0);
  assert.ok(fresh.months.every((m) => m.days.every((s) => s === "before" || s === "future")));
});

test("habitYear: done tidak pernah melebihi elapsed", () => {
  const today = on("2026-10-13");
  const start = on("2025-09-01");
  // pola acak tapi tetap: sebagian tercatat, sebagian nol, sebagian bolong, beberapa di masa depan
  const activity: number[] = [];
  const noSpend: number[] = [];
  for (let d = start; d <= today + 30; d++) {
    const r = (d * 2654435761) % 7;
    if (r < 3) activity.push(d);
    else if (r === 3) noSpend.push(d);
  }
  for (const year of [2025, 2026, 2027]) {
    const h = habitYear(activity, noSpend, year, today);
    assert.ok(h.done <= h.elapsed, `${year}: ${h.done} > ${h.elapsed}`);
    assert.equal(
      h.done,
      h.months.reduce((s, m) => s + m.done, 0)
    );
    assert.ok(h.longestRun <= h.done);
  }
});

test("mixHex: ujung, tengah, huruf besar, t dijepit", () => {
  assert.equal(mixHex("#7fcf6b", "#e8c35a", 0), "#7fcf6b");
  assert.equal(mixHex("#7fcf6b", "#e8c35a", 1), "#e8c35a");
  assert.equal(mixHex("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(mixHex("#FF0000", "#0000FF", 0.5), "#800080");
  assert.equal(mixHex("#7FCF6B", "#E8C35A", 0), "#7fcf6b");
  assert.equal(mixHex("#102030", "#ffffff", 2), "#ffffff");
  assert.equal(mixHex("#102030", "#ffffff", -1), "#102030");
  assert.equal(mixHex("#7fcf6b", "#e8c35a", 0.3), "#9fcb66");
  assert.equal(mixHex("bukan warna", "#ffffff", 0.5), "bukan warna");
});
