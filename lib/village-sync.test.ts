import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_PLACE_LIMITS } from "./place-limits";
import {
  EMPTY_SYNC_DATA,
  LOCAL_SYNC,
  MAX_OPS_PER_CALL,
  MAX_OUTBOX,
  applySyncOp,
  applySyncOps,
  compactOutbox,
  deriveView,
  importFromLegacy,
  importableLimits,
  legacyFingerprint,
  newerSync,
  parseSync,
  parseSyncData,
  parseSyncOps,
  samePlaceLimits,
  type LegacyRaw,
  type SyncOp,
  type VillageSync,
  type VillageSyncData
} from "./village-sync";

const TODAY = 20_740;
let n = 0;
const id = () => `op${(n++).toString(36)}`;
const data = (patch: Partial<VillageSyncData> = {}): VillageSyncData => ({ ...EMPTY_SYNC_DATA, ...patch });
const nospend = (day: number, on: boolean): SyncOp => ({ id: id(), t: "nospend", day, on });
const limit = (name: string, value: number | null): SyncOp => ({ id: id(), t: "limit", name, limit: value });
const tour = (status: "active" | "done" | "skipped", step: number, restart = false): SyncOp => ({
  id: id(),
  t: "tour",
  status,
  step,
  restart
});
const seen = (villagers: number, level: number): SyncOp => ({ id: id(), t: "seen", villagers, level });
const manyLimits = (count: number) =>
  Object.fromEntries(Array.from({ length: count }, (_, i) => [`tempat ${i}`, { name: `Tempat ${i}`, limit: 1000 + i }]));

test("parseSyncData: sampah jadi kosong, hari unik & urut dalam jendela, surat/seen/tur divalidasi", () => {
  for (const raw of [null, undefined, "x", 3, [], [1, 2]]) assert.deepEqual(parseSyncData(raw, TODAY), EMPTY_SYNC_DATA);
  const parsed = parseSyncData(
    {
      noSpend: [TODAY, TODAY - 1, TODAY, 1.5, "3", TODAY - 400, TODAY - 399, TODAY + 1, TODAY + 2],
      placeLimits: { "kopi  toko": { name: "Kopi  Toko", limit: 150_000 }, rusak: { name: "Rusak", limit: -1 } },
      letter: "i12",
      seen: { villagers: 2, level: 5 },
      tour: { status: "active", step: 42 }
    },
    TODAY
  );
  assert.deepEqual(parsed.noSpend, [TODAY - 399, TODAY - 1, TODAY, TODAY + 1]);
  assert.deepEqual(parsed.placeLimits, { "kopi toko": { name: "Kopi Toko", limit: 150_000 } });
  assert.equal(parsed.letter, "i12");
  assert.deepEqual(parsed.seen, { villagers: 2, level: 5 });
  assert.deepEqual(parsed.tour, { status: "active", step: 8 });

  const bad = parseSyncData({ letter: "<script>", seen: { villagers: -1, level: 2 }, tour: { status: "selesai", step: 1 } }, TODAY);
  assert.equal(bad.letter, null);
  assert.equal(bad.seen, null);
  assert.equal(bad.tour, null);
  assert.equal(parseSyncData({ letter: "w20736" }, TODAY).letter, "w20736");
});

test("parseSync: salinan server dari storage (available & at ikut dibaca)", () => {
  assert.equal(parseSync(null, TODAY), null);
  assert.deepEqual(parseSync({ noSpend: [TODAY], available: true, at: 99 }, TODAY), {
    ...EMPTY_SYNC_DATA,
    noSpend: [TODAY],
    available: true,
    at: 99
  });
  const odd = parseSync({ available: "ya", at: "kemarin" }, TODAY)!;
  assert.equal(odd.available, false);
  assert.equal(odd.at, 0);
});

test("nospend: nilai mutlak & idempoten, batas mundur 2 hari, batal selalu boleh", () => {
  const empty = data();
  const on = applySyncOp(empty, nospend(TODAY, true), TODAY);
  assert.deepEqual(on.noSpend, [TODAY]);
  assert.equal(applySyncOp(on, nospend(TODAY, true), TODAY), on, "menandai dua kali = objek yang sama");
  assert.equal(applySyncOp(empty, nospend(TODAY, false), TODAY), empty, "batal hari yang tidak ditandai = objek yang sama");

  assert.deepEqual(applySyncOp(empty, nospend(TODAY - 2, true), TODAY).noSpend, [TODAY - 2]);
  assert.equal(applySyncOp(empty, nospend(TODAY - 3, true), TODAY), empty, "lebih dari 2 hari ke belakang ditolak");
  assert.equal(applySyncOp(empty, nospend(TODAY + 1, true), TODAY), empty, "hari depan ditolak");

  const old = data({ noSpend: [TODAY - 30, TODAY - 1] });
  assert.deepEqual(applySyncOp(old, nospend(TODAY - 30, false), TODAY).noSpend, [TODAY - 1], "batal hari lama boleh");
  assert.deepEqual(applySyncOp(old, nospend(TODAY - 2, true), TODAY).noSpend, [TODAY - 30, TODAY - 2, TODAY - 1]);
});

test("nospend dari dua perangkat: A batal d1, B tandai d2 → [d2] apa pun urutannya", () => {
  const base = data({ noSpend: [TODAY - 1] });
  const a = nospend(TODAY - 1, false);
  const b = nospend(TODAY, true);
  assert.deepEqual(applySyncOps(base, [a, b], TODAY).noSpend, [TODAY]);
  assert.deepEqual(applySyncOps(base, [b, a], TODAY).noSpend, [TODAY]);
});

test("limit: per tempat, yang terakhir menang, hapus sungguhan, tempat ke-51 ditolak", () => {
  const two = applySyncOps(data(), [limit("Kopi", 100_000), limit("Bakso Pak Kumis", 50_000)], TODAY);
  assert.deepEqual(Object.keys(two.placeLimits).sort(), ["bakso pak kumis", "kopi"]);

  const last = applySyncOps(two, [limit("kopi", 120_000), limit("KOPI", 130_000)], TODAY);
  assert.deepEqual(last.placeLimits.kopi, { name: "KOPI", limit: 130_000 });

  const deleted = applySyncOp(last, limit("  Kopi ", null), TODAY);
  assert.equal("kopi" in deleted.placeLimits, false);
  assert.equal(applySyncOp(deleted, limit("Kopi", null), TODAY), deleted, "hapus yang tidak ada = objek yang sama");
  assert.equal(applySyncOp(deleted, limit("Kopi", 90_000), TODAY).placeLimits.kopi.limit, 90_000, "hapus lalu pasang = ada");

  const full = data({ placeLimits: manyLimits(MAX_PLACE_LIMITS) });
  assert.equal(applySyncOp(full, limit("Tempat baru", 10_000), TODAY), full, "tempat baru saat penuh ditolak");
  assert.equal(applySyncOp(full, limit("Tempat 3", 77_000), TODAY).placeLimits["tempat 3"].limit, 77_000, "yang lama tetap bisa diubah");
  assert.equal(Object.keys(applySyncOp(full, limit("Tempat 3", null), TODAY).placeLimits).length, MAX_PLACE_LIMITS - 1);

  assert.equal(applySyncOp(two, limit("   ", 10_000), TODAY), two);
  assert.equal(applySyncOp(two, limit("Kopi", 3_000_000_000), TODAY), two);
  assert.equal(applySyncOp(two, limit("Kopi", 10.5), TODAY), two);
  assert.equal(applySyncOp(two, limit("Kopi", 0), TODAY), two);
});

test("seen: maksimum per angka; letter: yang terakhir menang", () => {
  const first = applySyncOp(data(), seen(1, 4), TODAY);
  assert.deepEqual(first.seen, { villagers: 1, level: 4 });
  const mixed = applySyncOp(first, seen(3, 2), TODAY);
  assert.deepEqual(mixed.seen, { villagers: 3, level: 4 }, "perangkat dengan angka lebih kecil tidak menurunkan");
  assert.equal(applySyncOp(mixed, seen(2, 1), TODAY), mixed);

  const read = applySyncOp(data(), { id: id(), t: "letter", key: "i12" }, TODAY);
  assert.equal(read.letter, "i12");
  assert.equal(applySyncOp(read, { id: id(), t: "letter", key: "w20736" }, TODAY).letter, "w20736");
  assert.equal(applySyncOp(read, { id: id(), t: "letter", key: "i12" }, TODAY), read);
  assert.equal(applySyncOp(read, { id: id(), t: "letter", key: "xx" }, TODAY), read, "kunci tidak sah diabaikan");
});

test("tour: selesai/dilewati tidak ditimpa 'active' kecuali diulang lewat ❓", () => {
  const done = applySyncOp(data(), tour("done", 8), TODAY);
  assert.deepEqual(done.tour, { status: "done", step: 8 });
  assert.equal(applySyncOp(done, tour("active", 3), TODAY), done, "langkah dari perangkat lain tidak membuka lagi");
  assert.deepEqual(applySyncOp(done, tour("active", 0, true), TODAY).tour, { status: "active", step: 0 }, "restart menang");
  assert.deepEqual(applySyncOp(done, tour("skipped", 2), TODAY).tour, { status: "skipped", step: 2 });

  const active = applySyncOp(data(), tour("active", 2), TODAY);
  assert.deepEqual(applySyncOp(active, tour("active", 5), TODAY).tour, { status: "active", step: 5 });
  assert.deepEqual(applySyncOp(active, tour("skipped", 2), TODAY).tour, { status: "skipped", step: 2 });
  assert.deepEqual(applySyncOp(data(), tour("active", 99), TODAY).tour, { status: "active", step: 8 }, "langkah dijepit");
});

const importOp = (patch: Partial<Extract<SyncOp, { t: "import" }>>): SyncOp => ({
  id: id(),
  t: "import",
  noSpend: [],
  limits: [],
  letter: null,
  seen: null,
  tour: null,
  ...patch
});

test("import: gabung tanpa batas mundur, server menang, idempoten", () => {
  const server = data({
    noSpend: [TODAY - 1],
    placeLimits: { kopi: { name: "Kopi", limit: 100_000 } },
    letter: "i5",
    seen: { villagers: 1, level: 6 },
    tour: { status: "active", step: 3 }
  });
  const op = importOp({
    noSpend: [TODAY - 30, TODAY - 1, TODAY - 400, TODAY + 1],
    limits: [
      { name: "kopi", limit: 1 },
      { name: "Bakso", limit: 40_000 }
    ],
    letter: "i4",
    seen: { villagers: 2, level: 3 },
    tour: { status: "done", step: 8 }
  });
  const merged = applySyncOp(server, op, TODAY);
  assert.deepEqual(merged.noSpend, [TODAY - 30, TODAY - 1], "hari lama ikut, di luar jendela tidak");
  assert.deepEqual(merged.placeLimits, {
    kopi: { name: "Kopi", limit: 100_000 },
    bakso: { name: "Bakso", limit: 40_000 }
  });
  assert.equal(merged.letter, "i5", "surat hanya diisi kalau server belum punya");
  assert.deepEqual(merged.seen, { villagers: 2, level: 6 });
  assert.deepEqual(merged.tour, { status: "done", step: 8 }, "tur selesai mengalahkan yang aktif");
  assert.deepEqual(applySyncOp(merged, op, TODAY), merged, "impor dua kali = sekali");

  const empty = applySyncOp(data(), importOp({ letter: "i4", tour: { status: "active", step: 2 } }), TODAY);
  assert.equal(empty.letter, "i4");
  assert.deepEqual(empty.tour, { status: "active", step: 2 });
  const finished = data({ tour: { status: "skipped", step: 1 } });
  assert.deepEqual(applySyncOp(finished, importOp({ tour: { status: "done", step: 8 } }), TODAY).tour, finished.tour);
  assert.deepEqual(applySyncOp(finished, importOp({ tour: { status: "active", step: 4 } }), TODAY).tour, finished.tour);
  const activeServer = data({ tour: { status: "active", step: 6 } });
  assert.equal(applySyncOp(activeServer, importOp({ tour: { status: "active", step: 2 } }), TODAY), activeServer);
});

test("importableLimits: hanya tempat baru, sisa kuota, yang terakhir didahulukan", () => {
  const limits = Array.from({ length: 5 }, (_, i) => ({ name: `T${i}`, limit: 1000 + i }));
  assert.deepEqual(importableLimits(new Set(["t1"]), limits).map((l) => l.name), ["T0", "T2", "T3", "T4"]);
  const almostFull = new Set(Array.from({ length: MAX_PLACE_LIMITS - 2 }, (_, i) => `x${i}`));
  assert.deepEqual(importableLimits(almostFull, limits).map((l) => l.name), ["T3", "T4"]);
  assert.deepEqual(importableLimits(new Set(Object.keys(manyLimits(MAX_PLACE_LIMITS))), limits), []);
  assert.deepEqual(
    importableLimits(new Set(), [
      { name: "Kopi", limit: 1 },
      { name: "kopi", limit: 2 }
    ]),
    [{ name: "kopi", limit: 2 }]
  );
});

test("compactOutbox: satu op per kunci di posisi terakhir, seen digabung maksimum, id terbaru", () => {
  const a = nospend(TODAY, true);
  const b = limit("Kopi", 1000);
  const c = nospend(TODAY, false);
  const d = seen(2, 1);
  const e = seen(1, 5);
  const out = compactOutbox([a, b, c, d, e]);
  assert.deepEqual(
    out.map((o) => o.id),
    [b.id, c.id, e.id]
  );
  assert.deepEqual(out[2], { ...e, villagers: 2, level: 5 });

  // "active" biasa setelah restart tetap tanpa syarat; setelah status pasti, status itu yang bertahan.
  const restart = tour("active", 0, true);
  const step = tour("active", 1);
  const [folded] = compactOutbox([restart, step]);
  assert.deepEqual(folded, { ...step, restart: true });
  const done = tour("done", 8);
  const later = tour("active", 2);
  assert.deepEqual(compactOutbox([done, later]), [{ ...done, id: later.id }]);

  // Op impor jadi pembatas: tidak digabung dan op lain tidak dipindah melewatinya.
  const imp = importOp({ noSpend: [TODAY] });
  const before = nospend(TODAY, false);
  const after = nospend(TODAY, false);
  assert.deepEqual(compactOutbox([before, imp, after]), [before, imp, after]);
});

/** Generator acak sederhana (deterministik) untuk uji sifat. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

test("compactOutbox: hasil sama dengan menerapkan semua op (uji acak)", () => {
  const places = ["Kopi", "Bakso", "Seblak"];
  const statuses = ["active", "done", "skipped"] as const;
  for (let seed = 1; seed <= 400; seed++) {
    const r = rng(seed);
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
    const ops: SyncOp[] = Array.from({ length: 1 + Math.floor(r() * 14) }, (): SyncOp => {
      const k = r();
      if (k < 0.3) return nospend(TODAY - Math.floor(r() * 4), r() < 0.6);
      if (k < 0.5) return limit(pick(places), r() < 0.3 ? null : 1000 + Math.floor(r() * 5));
      if (k < 0.6) return { id: id(), t: "letter", key: pick(["i1", "i2", "w20736"]) };
      if (k < 0.7) return seen(Math.floor(r() * 4), Math.floor(r() * 9));
      if (k < 0.93) return tour(pick(statuses), Math.floor(r() * 9), r() < 0.2);
      return importOp({
        noSpend: [TODAY - 10, TODAY],
        limits: [{ name: pick(places), limit: 777 }],
        letter: pick(["i1", null]),
        seen: { villagers: 1, level: 1 },
        tour: r() < 0.5 ? { status: pick(statuses), step: 3 } : null
      });
    });
    const base = data({
      noSpend: r() < 0.5 ? [TODAY - 1] : [],
      placeLimits: r() < 0.5 ? { kopi: { name: "Kopi", limit: 500 } } : {},
      seen: r() < 0.5 ? { villagers: 1, level: 2 } : null,
      tour: r() < 0.5 ? { status: pick(statuses), step: 4 } : null
    });
    assert.deepEqual(applySyncOps(base, compactOutbox(ops), TODAY), applySyncOps(base, ops, TODAY), `seed ${seed}`);
  }
});

test("parseSyncOps: yang rusak dibuang, maks 100 op, impor ikut divalidasi", () => {
  assert.deepEqual(parseSyncOps("x"), []);
  assert.deepEqual(parseSyncOps({ length: 1 }), []);
  const ops = parseSyncOps([
    { id: "a1", t: "nospend", day: TODAY, on: true },
    { id: "a2", t: "toggle", day: TODAY },
    { id: "BAD!", t: "nospend", day: TODAY, on: true },
    { id: "a3", t: "nospend", day: 1.5, on: true },
    { id: "a4", t: "nospend", day: TODAY, on: "ya" },
    { id: "a5", t: "limit", name: "x".repeat(121), limit: 1000 },
    { id: "a6", t: "limit", name: "Kopi", limit: "1000" },
    { id: "a7", t: "limit", name: "Kopi", limit: 99.5 },
    { id: "a8", t: "limit", name: "  Kopi   Toko ", limit: null },
    { id: "a9", t: "letter", key: "i12" },
    { id: "b1", t: "letter", key: "zz" },
    { id: "b2", t: "seen", villagers: 1, level: -2 },
    { id: "b3", t: "tour", status: "active", step: 3, restart: "ya" },
    {
      id: "b4",
      t: "import",
      noSpend: [TODAY, TODAY, "x"],
      limits: [
        { name: "Bakso", limit: 1 },
        { name: "", limit: 5 }
      ],
      letter: "?",
      seen: null,
      tour: { status: "done", step: 8 }
    },
    null,
    "op"
  ]);
  assert.deepEqual(ops, [
    { id: "a1", t: "nospend", day: TODAY, on: true },
    { id: "a8", t: "limit", name: "Kopi Toko", limit: null },
    { id: "a9", t: "letter", key: "i12" },
    { id: "b3", t: "tour", status: "active", step: 3, restart: false },
    {
      id: "b4",
      t: "import",
      noSpend: [TODAY],
      limits: [{ name: "Bakso", limit: 1 }],
      letter: null,
      seen: null,
      tour: { status: "done", step: 8 }
    }
  ]);
  const flood = Array.from({ length: 150 }, (_, i) => ({ id: `f${i}`, t: "letter", key: "i1" }));
  assert.equal(parseSyncOps(flood).length, MAX_OPS_PER_CALL);
  assert.equal(parseSyncOps(flood, MAX_OUTBOX).length, 150, "outbox di browser tidak dipotong ke batas per panggilan");
});

test("browser & server sepakat: deriveView = applySyncOps atas op yang lewat JSON + parseSyncOps", () => {
  const base = data({ noSpend: [TODAY - 2], placeLimits: { kopi: { name: "Kopi", limit: 1 } } });
  const outbox: SyncOp[] = [
    nospend(TODAY, true),
    nospend(TODAY - 2, false),
    limit("Kopi", null),
    limit("Bakso", 25_000),
    seen(1, 3),
    tour("active", 2),
    importOp({ noSpend: [TODAY - 20], letter: "i3" })
  ];
  const wire = parseSyncOps(JSON.parse(JSON.stringify(outbox)));
  assert.deepEqual(wire, outbox);
  assert.deepEqual(deriveView(base, outbox, TODAY), applySyncOps(base, wire, TODAY));
});

test("newerSync: yang dibaca lebih belakangan menang, seri = yang datang", () => {
  const older: VillageSync = { ...LOCAL_SYNC, available: true, at: 100, letter: "i1" };
  const newer: VillageSync = { ...LOCAL_SYNC, available: true, at: 200, letter: "i2" };
  assert.equal(newerSync(older, newer), newer);
  assert.equal(newerSync(newer, older), newer, "snapshot aksi yang lebih lama tidak menimpa");
  const tie = { ...older, letter: "i9" };
  assert.equal(newerSync(older, tie), tie);
  assert.equal(newerSync(null, older), older);
  assert.equal(newerSync(older, null), older);
});

test("samePlaceLimits: urutan kunci tidak berpengaruh", () => {
  const a = { kopi: { name: "Kopi", limit: 1 }, bakso: { name: "Bakso", limit: 2 } };
  const b = { bakso: { name: "Bakso", limit: 2 }, kopi: { name: "Kopi", limit: 1 } };
  assert.equal(samePlaceLimits(a, b), true);
  assert.equal(samePlaceLimits(a, { ...b, kopi: { name: "Kopi", limit: 3 } }), false);
  assert.equal(samePlaceLimits(a, { kopi: a.kopi }), false);
});

const RAW_EMPTY: LegacyRaw = { nospend: null, seen: null, letter: null, limits: null, tour: null };

test("impor kunci v1: sidik jari & op impor", () => {
  assert.equal(legacyFingerprint(RAW_EMPTY), null);
  assert.equal(importFromLegacy(RAW_EMPTY, "x1", TODAY), null);

  const raw: LegacyRaw = {
    nospend: JSON.stringify([TODAY - 10, TODAY - 10, TODAY - 500, TODAY + 3, "x"]),
    seen: "{rusak",
    letter: JSON.stringify("i12"),
    limits: JSON.stringify({ kopi: { name: "Kopi", limit: 150_000.4 }, x: { name: "X", limit: -1 } }),
    tour: JSON.stringify({ status: "skipped", step: 3 })
  };
  assert.deepEqual(importFromLegacy(raw, "x1", TODAY), {
    id: "x1",
    t: "import",
    noSpend: [TODAY - 10],
    limits: [{ name: "Kopi", limit: 150_000 }],
    letter: "i12",
    seen: null,
    tour: { status: "skipped", step: 3 }
  });

  const fp = legacyFingerprint(raw);
  assert.ok(fp);
  assert.equal(legacyFingerprint({ ...raw }), fp, "stabil");
  assert.notEqual(legacyFingerprint({ ...raw, letter: JSON.stringify("i13") }), fp, "berubah kalau isinya berubah");
  assert.equal(importFromLegacy({ ...RAW_EMPTY, seen: "{rusak", letter: "123" }, "x2", TODAY), null, "semua rusak = tidak ada impor");
  assert.ok(legacyFingerprint({ ...RAW_EMPTY, seen: "{rusak" }), "tetap ditandai sudah dicek walau isinya rusak");
});
