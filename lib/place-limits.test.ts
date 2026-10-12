import { test } from "node:test";
import assert from "node:assert/strict";
import { findPlaceLimit, limitStatus, NO_LIMITS, parsePlaceLimits, withPlaceLimit } from "./place-limits";

test("limitStatus: aman, hampir (mulai 80%), lewat (melewati batas)", () => {
  assert.equal(limitStatus(0, 150_000)?.level, "ok");
  assert.equal(limitStatus(119_999, 150_000)?.level, "ok");
  assert.equal(limitStatus(120_000, 150_000)?.level, "warn");
  assert.deepEqual(limitStatus(150_000, 150_000), { level: "warn", ratio: 1, remaining: 0 });
  const over = limitStatus(150_001, 150_000)!;
  assert.equal(over.level, "over");
  assert.equal(over.remaining, -1);
  assert.equal(limitStatus(10, 0), null);
  assert.equal(limitStatus(10, -5), null);
  assert.equal(limitStatus(10, Number.NaN), null);
});

test("parsePlaceLimits: buang yang rusak, normalkan kunci, bulatkan, maksimal 50", () => {
  assert.deepEqual(parsePlaceLimits(null), {});
  assert.deepEqual(parsePlaceLimits([]), {});
  assert.deepEqual(parsePlaceLimits("x"), {});
  assert.deepEqual(
    parsePlaceLimits({
      "Kopi  Toko": { name: "Kopi  Toko", limit: 150_000.6 },
      a: { name: "Minus", limit: -1 },
      b: { name: "NaN", limit: Number.NaN },
      c: { name: "   ", limit: 10_000 },
      d: { name: "Terlalu", limit: 3_000_000_000 },
      e: "bukan objek",
      f: { limit: 20_000 }
    }),
    { "kopi toko": { name: "Kopi Toko", limit: 150_001 }, f: { name: "f", limit: 20_000 } }
  );
  const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`t${i}`, { name: `Tempat ${i}`, limit: 1000 + i }]));
  const kept = parsePlaceLimits(many);
  assert.equal(Object.keys(kept).length, 50);
  assert.ok("tempat 59" in kept); // yang terakhir disimpan
});

test("withPlaceLimit: tambah, ganti, hapus, tanpa mengubah masukan", () => {
  const a = withPlaceLimit(NO_LIMITS, "  Kopi Toko Djawa ", 150_000);
  assert.deepEqual(a, { "kopi toko djawa": { name: "Kopi Toko Djawa", limit: 150_000 } });
  assert.deepEqual(NO_LIMITS, {});
  // ejaan baru dengan nominal sama tetap disimpan (nama tampilan ikut ketikan terakhir)
  assert.equal(withPlaceLimit(a, "kopi toko djawa", 150_000)["kopi toko djawa"].name, "kopi toko djawa");
  assert.equal(withPlaceLimit(a, "Kopi Toko Djawa", 150_000), a); // tidak berubah = objek yang sama
  const b = withPlaceLimit(a, "Kopi Toko Djawa", 200_000);
  assert.equal(b["kopi toko djawa"].limit, 200_000);
  assert.equal(a["kopi toko djawa"].limit, 150_000);
  assert.deepEqual(withPlaceLimit(b, "KOPI toko djawa", null), {});
  assert.deepEqual(withPlaceLimit(b, "kopi toko djawa", 0), {});
  assert.equal(withPlaceLimit(b, "Bakso", null), b);
  assert.equal(withPlaceLimit(b, "   ", 10_000), b);
});

test("findPlaceLimit: cocok persis setelah dinormalkan", () => {
  const limits = withPlaceLimit(NO_LIMITS, "Kopi Toko Djawa", 150_000);
  assert.equal(findPlaceLimit(limits, " KOPI  toko djawa")?.limit, 150_000);
  assert.equal(findPlaceLimit(limits, "kop"), null);
  assert.equal(findPlaceLimit(limits, null), null);
});
