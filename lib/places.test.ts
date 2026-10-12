import { test } from "node:test";
import assert from "node:assert/strict";
import type { ExpenseView } from "./game";
import {
  categoryColor,
  categoryIcon,
  groupNearby,
  jajanSummary,
  knownPlacesFrom,
  matchKnownPlace,
  roundCoord,
  shortCategory,
  spendingByPlace,
  spotMatches,
  titleCase
} from "./places";

const PLACES = [
  { name: "Bakso Pak Kumis", lat: -6.8935, lng: 107.6104, count: 2 },
  { name: "Kopi Kumis", lat: -6.9, lng: 107.6, count: 7 },
  { name: "Indomaret Dago", lat: -6.8858, lng: 107.6136, count: 3 }
];

test("matchKnownPlace: persis dulu, lalu sebagian yang paling sering", () => {
  assert.equal(matchKnownPlace("  bakso   pak kumis ", PLACES)?.name, "Bakso Pak Kumis");
  assert.equal(matchKnownPlace("kumis", PLACES)?.name, "Kopi Kumis");
  assert.equal(matchKnownPlace("dago", PLACES)?.name, "Indomaret Dago");
  assert.equal(matchKnownPlace("ku", PLACES), null); // kurang dari 3 huruf
  assert.equal(matchKnownPlace("starbucks", PLACES), null);
});

test("knownPlacesFrom: nama unik, titik terbaru, urut paling sering", () => {
  const rows = [
    // urut dari yang terbaru
    { placeName: "Kopi Kumis", latitude: -6.9001, longitude: 107.6001 },
    { placeName: "Bakso Pak Kumis", latitude: -6.8935, longitude: 107.6104 },
    { placeName: "kopi  kumis", latitude: -6.95, longitude: 107.65 },
    { placeName: "Tanpa titik", latitude: null, longitude: null },
    { placeName: null, latitude: -6.9, longitude: 107.6 }
  ];
  assert.deepEqual(knownPlacesFrom(rows), [
    { name: "Kopi Kumis", lat: -6.9001, lng: 107.6001, count: 2 },
    { name: "Bakso Pak Kumis", lat: -6.8935, lng: 107.6104, count: 1 }
  ]);
  assert.equal(knownPlacesFrom(rows, 1).length, 1);
});

const expense = (e: Partial<ExpenseView>): ExpenseView => ({
  id: 1,
  amount: 10_000,
  category: "Makan harian",
  note: null,
  source: "gaji",
  date: "2026-10-10T00:00:00.000Z",
  walletId: 1,
  walletName: "BCA",
  placeName: null,
  latitude: null,
  longitude: null,
  ...e
});

test("spendingByPlace: per nama tempat, titik tanpa nama per lokasi, tanpa titik diabaikan", () => {
  const spots = spendingByPlace([
    expense({ amount: 15_000, placeName: "Bakso Pak Kumis", latitude: -6.8935, longitude: 107.6104, date: "2026-10-01T00:00:00Z" }),
    expense({ amount: 20_000, placeName: "bakso pak kumis", latitude: -6.8936, longitude: 107.6105, date: "2026-10-05T00:00:00Z" }),
    expense({
      amount: 5_000,
      category: "Nongkrong / jajan",
      placeName: "Bakso Pak Kumis",
      latitude: -6.8935,
      longitude: 107.6104,
      date: "2026-10-02T00:00:00Z"
    }),
    expense({ amount: 50_000, category: "Transport", latitude: -6.88, longitude: 107.61 }),
    expense({ amount: 7_000, category: "Transport", latitude: -6.88001, longitude: 107.61001 }),
    expense({ amount: 99_000, placeName: "Tanpa titik" })
  ]);
  assert.equal(spots.length, 2);
  const [unnamed, bakso] = spots;
  assert.equal(unnamed.name, null);
  assert.equal(unnamed.total, 57_000);
  assert.equal(unnamed.count, 2);
  assert.equal(unnamed.topCategory, "Transport");
  assert.equal(bakso.name, "Bakso Pak Kumis");
  assert.equal(bakso.total, 40_000);
  assert.equal(bakso.count, 3);
  assert.equal(bakso.topCategory, "Makan harian");
  // titik ikut catatan terbaru
  assert.deepEqual([bakso.lat, bakso.lng], [-6.8936, 107.6105]);
});

test("helper kecil", () => {
  assert.equal(titleCase("warung bu imas"), "Warung Bu Imas");
  assert.equal(roundCoord(-6.893456789), -6.89346);
  assert.equal(categoryColor("Transport"), "#5b9ae0");
  assert.equal(categoryColor("Lainnya"), "#9a8aa0");
  assert.equal(categoryIcon("Nongkrong / jajan"), "☕");
  assert.equal(categoryIcon(null), "📍");
  assert.equal(shortCategory("Langganan (Spotify, Netflix, dll)"), "Langganan");
});

const at = (lat: number, lng: number) => ({ latitude: lat, longitude: lng });

test("jajanSummary: tempat, perjalanan, tanpa tempat, langganan, pertama kali", () => {
  const month = [
    // dua hari berbeda = dua kunjungan
    expense({ amount: 15_000, placeName: "Bakso Pak Kumis", ...at(-6.8935, 107.6104), date: "2026-10-03T05:00:00Z" }),
    expense({ amount: 20_000, placeName: "Bakso Pak Kumis", ...at(-6.8935, 107.6104), date: "2026-10-08T05:00:00Z" }),
    expense({ amount: 30_000, category: "Nongkrong / jajan", placeName: "Kopi Toko Djawa", ...at(-6.9175, 107.6098) }),
    // dua struk di hari WIB yang sama (pagi & malam) = satu kunjungan
    expense({ amount: 26_500, category: "Belanja kecil", placeName: "Indomaret Dago", ...at(-6.8858, 107.6136), date: "2026-10-09T01:00:00Z" }),
    expense({ amount: 12_000, category: "Makan harian", placeName: "Indomaret Dago", ...at(-6.8858, 107.6136), date: "2026-10-09T14:00:00Z" }),
    expense({ amount: 18_000, category: "Transport" }),
    expense({ amount: 22_000, category: "Transport" }),
    expense({ amount: 54_990, category: "Langganan (Spotify, Netflix, dll)" }),
    expense({ amount: 150_000, category: "Pulsa & Internet" })
  ];
  const s = jajanSummary(month, ["bakso pak kumis"]);
  assert.equal(s.spots.length, 3);
  assert.equal(s.locatedTotal, 103_500);
  assert.equal(s.monthTotal, 348_490);
  assert.deepEqual(s.travel, { count: 2, total: 40_000 });
  assert.deepEqual(s.unplaced, { count: 2, total: 204_990, categories: ["Pulsa & Internet", "Langganan"] });
  // Indomaret punya dua kategori: ikut dihitung di keduanya
  assert.deepEqual(s.categories, [
    { label: "Makan harian", places: 2 },
    { label: "Belanja kecil", places: 1 },
    { label: "Nongkrong / jajan", places: 1 }
  ]);
  assert.deepEqual(s.regulars.map((p) => p.name), ["Bakso Pak Kumis"]);
  const indomaret = s.spots.find((p) => p.name === "Indomaret Dago")!;
  assert.deepEqual([indomaret.count, indomaret.visits], [2, 1]);
  assert.deepEqual(s.firstVisits.map((p) => p.name).sort(), ["Indomaret Dago", "Kopi Toko Djawa"]);

  const makan = jajanSummary(month, [], "Makan harian");
  assert.deepEqual(makan.spots.map((p) => [p.name, p.total]), [["Bakso Pak Kumis", 35_000], ["Indomaret Dago", 12_000]]);
  assert.equal(makan.locatedTotal, 47_000);
  assert.equal(makan.categories.length, 3); // chip tetap semua kategori
});

test("spotMatches: nama atau kategori, tanpa peduli huruf besar", () => {
  const [spot] = spendingByPlace([expense({ category: "Nongkrong / jajan", placeName: "Kopi Toko Djawa", ...at(-6.9, 107.6) })]);
  assert.ok(spotMatches(spot, "djawa"));
  assert.ok(spotMatches(spot, "  NONGKRONG "));
  assert.ok(spotMatches(spot, ""));
  assert.ok(!spotMatches(spot, "bakso"));
});

test("groupNearby: yang terbesar jadi pusat dan menyerap tetangga dalam radius", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 200, y: 0 },
    { x: 60, y: 0 }
  ];
  // titik 1 terbesar: menyerap 0 dan 3 (jarak 30), titik 2 sendirian
  assert.deepEqual(groupNearby(points, [5, 10, 1, 2], 40), [[1, 0, 3], [2]]);
  assert.deepEqual(groupNearby(points, [5, 10, 1, 2], 10), [[1], [0], [3], [2]]);
  assert.deepEqual(groupNearby([], [], 40), []);
});
