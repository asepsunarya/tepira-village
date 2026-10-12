import { test } from "node:test";
import assert from "node:assert/strict";
import type { ExpenseView } from "./game";
import { categoryColor, knownPlacesFrom, matchKnownPlace, roundCoord, spendingByPlace, titleCase } from "./places";

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
});
