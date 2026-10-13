import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_GOAL_STREAMS, buildMoneyFlow, layoutFlow, overflowBy, overflowing, type FlowInput } from "./flow";

type Spend = FlowInput["expenses"][number];
const spend = (amount: number, category: string | null, source = "gaji"): Spend => ({ amount, category, source });
const input = (i: Partial<Omit<FlowInput, "summary">> & { summary?: Partial<FlowInput["summary"]> } = {}): FlowInput => ({
  expenses: [],
  goals: [],
  salary: null,
  ...i,
  summary: {
    income: { salary: 7_500_000, bonus: 0, total: 7_500_000 },
    savedThisMonth: 0,
    savingsAllocation: 0,
    savedByGoal: [],
    ...i.summary
  }
});
const GOALS = [
  { id: 1, title: "Dana darurat" },
  { id: 2, title: "Motor" }
];
const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);

test("aliran: gaji → kategori (terbesar dulu) → belum terpakai, jatah ikut terbaca", () => {
  const f = buildMoneyFlow(
    input({
      expenses: [spend(400_000, "Transport"), spend(1_200_000, "Makan harian"), spend(300_000, "Nongkrong / jajan")],
      salary: {
        allocations: [
          { category: "Makan harian", amount: 1_000_000 },
          { category: "Transport", amount: 600_000 },
          { category: "Nongkrong / jajan", amount: 0 } // form gaji menyimpan semua kategori
        ]
      }
    })
  );
  assert.deepEqual(
    f.outs.map((o) => [o.key, o.amount]),
    [
      ["cat:Makan harian", 1_200_000],
      ["cat:Transport", 400_000],
      ["cat:Nongkrong / jajan", 300_000],
      ["sisa", 5_600_000]
    ]
  );
  assert.equal(f.outs[0].budget, 1_000_000);
  assert.ok(overflowing(f.outs[0]));
  assert.equal(overflowBy(f.outs[0]), 200_000);
  assert.ok(!overflowing(f.outs[1]));
  assert.equal(f.outs[2].budget, null); // jatah 0 = tidak dijatah → tidak pernah "meluap"
  assert.ok(!overflowing(f.outs[2]));
  assert.equal(f.outs[3].label, "Belum terpakai");
  assert.equal(f.spent, 1_900_000);
  assert.equal(f.rest, 5_600_000);
  assert.equal(f.deficit, 0);
  assert.equal(sum(f.sources), f.total);
  assert.equal(sum(f.outs), f.total);
});

test("aliran: kategori lama (key), kosong, dan asing dinormalkan seperti panel Gaji", () => {
  const f = buildMoneyFlow(
    input({
      expenses: [
        spend(10_000, "makan_harian"),
        spend(20_000, "Makan harian"),
        spend(5_000, null),
        spend(3_000, "  "),
        spend(54_900, "Langganan (Spotify, Netflix, dll)"),
        spend(7_000, "Hobi"),
        spend(-500, "Transport"), // baris aneh dari tepira diabaikan
        spend(0, "Transport")
      ],
      salary: { allocations: [{ category: "makan_harian", amount: 25_000 }] }
    })
  );
  const byKey = new Map(f.outs.map((o) => [o.key, o]));
  assert.equal(byKey.get("cat:Makan harian")?.amount, 30_000);
  assert.equal(byKey.get("cat:Makan harian")?.count, 2);
  assert.equal(byKey.get("cat:Makan harian")?.budget, 25_000);
  assert.equal(byKey.get("cat:Lainnya")?.amount, 8_000);
  assert.equal(byKey.get("cat:Lainnya")?.icon, "🧾");
  assert.equal(byKey.get("cat:Langganan (Spotify, Netflix, dll)")?.label, "Langganan");
  assert.equal(byKey.get("cat:Langganan (Spotify, Netflix, dll)")?.icon, "🎧");
  assert.equal(byKey.get("cat:Hobi")?.label, "Hobi");
  assert.ok(!byKey.has("cat:Transport"));
  assert.equal(f.spent, 30_000 + 8_000 + 54_900 + 7_000);
});

test("aliran: meluap hanya dihitung dari bagian bersumber gaji", () => {
  const salary = { allocations: [{ category: "Makan harian", amount: 1_000_000 }] };
  const over = buildMoneyFlow(input({ expenses: [spend(1_200_000, "Makan harian"), spend(300_000, "Makan harian", "bonus")], salary }));
  assert.equal(over.outs[0].amount, 1_500_000);
  assert.equal(over.outs[0].fromSalary, 1_200_000);
  assert.ok(overflowing(over.outs[0]));
  assert.equal(overflowBy(over.outs[0]), 200_000);
  const fine = buildMoneyFlow(input({ expenses: [spend(900_000, "Makan harian"), spend(300_000, "Makan harian", "bonus")], salary }));
  assert.ok(!overflowing(fine.outs[0]));
  assert.equal(overflowBy(fine.outs[0]), 0);
});

test("aliran: setoran ke goal diambil dari alokasi tabungan dulu (tidak dobel)", () => {
  // alokasi 3 jt, setor 1 jt → 1 jt ke goal + 2 jt disisihkan, total tabungan tetap 3 jt
  const f = buildMoneyFlow(
    input({
      goals: GOALS,
      summary: { savingsAllocation: 3_000_000, savedThisMonth: 1_000_000, savedByGoal: [{ goalId: 2, amount: 1_000_000 }] },
      goalColor: (id) => (id === 2 ? "#f28cb4" : "#000")
    })
  );
  assert.deepEqual(
    f.outs.map((o) => [o.key, o.label, o.amount]),
    [
      ["goal:2", "Motor", 1_000_000],
      ["sisih", "Disisihkan", 2_000_000],
      ["sisa", "Belum terpakai", 4_500_000]
    ]
  );
  assert.equal(f.saved, 3_000_000);
  assert.equal(f.outs[0].goalId, 2);
  assert.equal(f.outs[0].color, "#f28cb4");

  // setoran lebih besar dari alokasi: tidak ada "Disisihkan"
  const g = buildMoneyFlow(
    input({
      goals: GOALS,
      summary: { savingsAllocation: 500_000, savedThisMonth: 2_000_000, savedByGoal: [{ goalId: 1, amount: 2_000_000 }] }
    })
  );
  assert.equal(g.saved, 2_000_000);
  assert.ok(!g.outs.some((o) => o.kind === "sisih"));
});

test("aliran: yang keluar melebihi pemasukan ditutup dari saldo dompet", () => {
  const f = buildMoneyFlow(
    input({
      summary: { income: { salary: 1_000_000, bonus: 200_000, total: 1_200_000 }, savedThisMonth: 100_000, savedByGoal: [{ goalId: 1, amount: 100_000 }] },
      expenses: [spend(1_400_000, "Makan harian")],
      goals: GOALS
    })
  );
  assert.deepEqual(
    f.sources.map((s) => [s.kind, s.amount]),
    [
      ["gaji", 1_000_000],
      ["bonus", 200_000],
      ["dompet", 300_000]
    ]
  );
  assert.equal(f.deficit, 300_000);
  assert.equal(f.rest, 0);
  assert.ok(!f.outs.some((o) => o.kind === "sisa"));
  assert.equal(sum(f.sources), sum(f.outs));
});

test("aliran: belum ada gaji tapi ada pengeluaran → seluruhnya dari saldo dompet", () => {
  const f = buildMoneyFlow(input({ summary: { income: { salary: 0, bonus: 0, total: 0 } }, expenses: [spend(50_000, "Transport")] }));
  assert.deepEqual(f.sources.map((s) => s.kind), ["dompet"]);
  assert.equal(f.total, 50_000);
});

test("aliran: bulan kosong", () => {
  const f = buildMoneyFlow(input({ summary: { income: { salary: 0, bonus: 0, total: 0 } } }));
  assert.equal(f.total, 0);
  assert.equal(f.sources.length, 0);
  assert.equal(f.outs.length, 0);
  const l = layoutFlow(f, 600);
  assert.equal(l.links.length, 0);
  assert.ok(l.height > 0);
});

test("aliran: goal lebih dari batas digabung jadi 'Goal lain (n)'", () => {
  const deposits = Array.from({ length: MAX_GOAL_STREAMS + 2 }, (_, i) => ({ goalId: i + 1, amount: (i + 1) * 100_000 }));
  const total = sum(deposits);
  const f = buildMoneyFlow(
    input({
      summary: { savedThisMonth: total, savedByGoal: deposits },
      goals: deposits.map((d) => ({ id: d.goalId, title: `Goal ${d.goalId}` }))
    })
  );
  const goals = f.outs.filter((o) => o.kind === "goal");
  assert.equal(goals.length, MAX_GOAL_STREAMS + 1);
  assert.equal(goals[0].label, `Goal ${MAX_GOAL_STREAMS + 2}`); // terbesar dulu
  assert.equal(goals.at(-1)!.label, "Goal lain (2)");
  assert.equal(goals.at(-1)!.amount, 100_000 + 200_000);
  assert.equal(sum(goals), total);
});

test("tata letak: pita masuk & keluar menumpuk rapat di waduk, tujuan tidak bertumpuk", () => {
  const f = buildMoneyFlow(
    input({
      summary: {
        income: { salary: 6_000_000, bonus: 1_000_000, total: 7_000_000 },
        savingsAllocation: 1_000_000,
        savedThisMonth: 1_500_000,
        savedByGoal: [{ goalId: 1, amount: 1_500_000 }]
      },
      expenses: [spend(2_000_000, "Makan harian"), spend(500_000, "Transport"), spend(1_000, "Pulsa & Internet")],
      goals: GOALS
    })
  );
  for (const width of [300, 336, 900]) {
    const l = layoutFlow(f, width);
    const ins = l.links.filter((k) => k.to === "pool");
    const outs = l.links.filter((k) => k.from === "pool");
    assert.equal(ins.length, 2);
    assert.equal(outs.length, f.outs.length);
    // pita setipis apa pun tetap terlihat
    assert.ok(outs.every((k) => k.thickness >= 2));
    // tujuan berurutan dari atas ke bawah tanpa tumpang tindih label (≥ 1 baris)
    for (let i = 1; i < l.outs.length; i++) {
      const prevCenter = l.outs[i - 1].y + l.outs[i - 1].h / 2;
      const center = l.outs[i].y + l.outs[i].h / 2;
      assert.ok(center - prevCenter >= 40, `baris ${i} terlalu rapat pada lebar ${width}`);
    }
    // semua di dalam kanvas, dan masih ada ruang label di kanan tujuan
    for (const b of [...l.sources, ...l.outs]) {
      assert.ok(b.y >= 0 && b.y + b.h <= l.height, "node keluar kanvas");
      assert.ok(b.x >= 0 && b.x + b.w <= l.width, "node keluar kanvas");
    }
    assert.ok(l.width - (l.outs[0].x + l.outs[0].w) >= 100, `ruang label kurang pada lebar ${width}`);
    assert.ok(l.pool.x > l.sources[0].x && l.pool.x + l.pool.w < l.outs[0].x);
    // waduk setinggi tumpukan pita yang paling tebal (pita minimal 2 px bisa membuat sisi keluar sedikit lebih tebal)
    const inT = ins.reduce((s, k) => s + k.thickness, 0);
    const outT = outs.reduce((s, k) => s + k.thickness, 0);
    assert.ok(Math.abs(Math.max(inT, outT) - l.pool.h) < 0.5);
    assert.ok(Math.abs(inT - outT) <= 2 * f.outs.length);
  }
});
