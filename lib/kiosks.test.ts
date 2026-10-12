import { test } from "node:test";
import assert from "node:assert/strict";
import type { ExpenseView, KnownPlace } from "./game";
import { isCurrentPeriod, periodWord } from "./format";
import { assignKioskSlots, kioskBusyness, pickKiosks } from "./kiosks";
import { NO_LIMITS, withPlaceLimit } from "./place-limits";
import { spendByPlaceName } from "./places";

const expense = (e: Partial<ExpenseView>): ExpenseView => ({
  id: 1,
  amount: 10_000,
  category: "Makan harian",
  note: null,
  source: "gaji",
  date: "2026-10-10T05:00:00.000Z",
  walletId: 1,
  walletName: "BCA",
  placeName: null,
  latitude: null,
  longitude: null,
  ...e
});

test("spendByPlaceName: nama dinormalkan, tanpa titik ikut, kunjungan per hari WIB", () => {
  const m = spendByPlaceName([
    expense({ amount: 20_000, category: "Nongkrong / jajan", placeName: "Kopi Toko Djawa", latitude: -6.9, longitude: 107.6, date: "2026-10-09T01:00:00Z" }),
    expense({ amount: 15_000, category: "Nongkrong / jajan", placeName: " kopi  toko djawa ", date: "2026-10-09T14:00:00Z" }),
    expense({ amount: 30_000, category: "Makan harian", placeName: "Kopi TOKO Djawa", date: "2026-10-09T17:30:00Z" }),
    expense({ amount: 99_000, placeName: null })
  ]);
  assert.equal(m.size, 1);
  const kopi = m.get("kopi toko djawa")!;
  assert.equal(kopi.total, 65_000);
  assert.equal(kopi.count, 3);
  assert.equal(kopi.visits, 2); // 17:30Z = 00:30 WIB hari berikutnya
  assert.equal(kopi.name, "Kopi TOKO Djawa"); // ejaan catatan terbaru
  assert.equal(kopi.topCategory, "Nongkrong / jajan");
});

test("kioskBusyness: sepi, 1–2, 3–5, 6+", () => {
  assert.deepEqual([0, 1, 2, 3, 5, 6, 20].map(kioskBusyness), [0, 1, 1, 2, 2, 3, 3]);
});

test("assignKioskSlots: stabil, unik, melewati slot terblokir", () => {
  const keys = ["kopi toko djawa", "bakso pak kumis", "warkop bang ijo", "mie gacoan dago"];
  const a = assignKioskSlots(keys, 8);
  const b = assignKioskSlots([...keys].reverse(), 8);
  assert.deepEqual([...a.entries()].sort(), [...b.entries()].sort());
  assert.equal(new Set(a.values()).size, keys.length);
  const blocked = assignKioskSlots(keys, 8, [...a.values()].slice(0, 1));
  assert.ok(![...blocked.values()].includes([...a.values()][0]));
  // menambah tempat baru tidak memindahkan kios lama yang slot hash-nya tidak bentrok
  const more = assignKioskSlots([...keys, "seblak teh imas"], 8);
  const moved = keys.filter((k) => more.get(k) !== a.get(k));
  assert.ok(moved.length <= 1);
  // slot penuh: sisanya tidak dapat tempat
  assert.equal(assignKioskSlots(["a", "b", "c"], 2).size, 2);
});

test("pickKiosks: syarat, prioritas batas, kapasitas, status bulan ini", () => {
  const places: KnownPlace[] = [
    { name: "Kopi Toko Djawa", lat: -6.917, lng: 107.609, count: 8 },
    { name: "Warkop Bang Ijo", lat: -6.896, lng: 107.612, count: 3 },
    { name: "Bakso Pak Kumis", lat: -6.893, lng: 107.61, count: 3 },
    { name: "Sekali Doang", lat: -6.9, lng: 107.6, count: 1 }
  ];
  const month = spendByPlaceName([
    expense({ amount: 153_000, category: "Nongkrong / jajan", placeName: "Kopi Toko Djawa" }),
    expense({ amount: 60_000, placeName: "Bakso Pak Kumis", date: "2026-10-03T05:00:00Z" }),
    expense({ amount: 1_000, placeName: "Bakso Pak Kumis", date: "2026-10-04T05:00:00Z" })
  ]);
  let limits = withPlaceLimit(NO_LIMITS, "Kopi Toko Djawa", 150_000);
  limits = withPlaceLimit(limits, "Sekali Doang", 50_000);
  limits = withPlaceLimit(limits, "Warung Baru", 40_000);

  const kiosks = pickKiosks(places, month, limits);
  assert.deepEqual(
    kiosks.map((k) => k.key),
    ["kopi toko djawa", "sekali doang", "warung baru", "bakso pak kumis", "warkop bang ijo"]
  );
  const kopi = kiosks[0];
  assert.equal(kopi.status?.level, "over");
  assert.equal(kopi.monthTotal, 153_000);
  assert.equal(kopi.busy, 1);
  const baru = kiosks.find((k) => k.key === "warung baru")!;
  assert.equal(baru.point, null);
  assert.equal(baru.yearCount, 0);
  assert.equal(baru.status?.level, "ok");
  const warkop = kiosks.find((k) => k.key === "warkop bang ijo")!;
  assert.equal(warkop.busy, 0);
  assert.equal(warkop.monthVisits, 0);
  assert.equal(warkop.limit, null);
  assert.equal(kiosks.find((k) => k.key === "bakso pak kumis")!.monthVisits, 2);
  assert.equal(new Set(kiosks.map((k) => k.slot)).size, kiosks.length);

  // tanpa batas, yang hanya sekali tidak dapat kios
  assert.ok(!pickKiosks(places, month, NO_LIMITS).some((k) => k.key === "sekali doang"));
  // kapasitas & slot terblokir
  assert.equal(pickKiosks(places, month, limits, 3).length, 3);
  const blocked = pickKiosks(places, month, limits, 5, [4]);
  assert.equal(blocked.length, 4);
  assert.ok(blocked.every((k) => k.slot !== 4));
  // yang punya batas menang atas yang lebih sering
  assert.equal(pickKiosks(places, month, limits, 1)[0].key, "kopi toko djawa");
});

test("periode: bulan ini vs bulan lain", () => {
  const now = new Date(2026, 9, 12);
  assert.ok(isCurrentPeriod({ month: 10, year: 2026 }, now));
  assert.ok(!isCurrentPeriod({ month: 9, year: 2026 }, now));
  assert.equal(periodWord({ month: 10, year: 2026 }, now), "bulan ini");
  assert.equal(periodWord({ month: 9, year: 2026 }, now), "di September");
});
