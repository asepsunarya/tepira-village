import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KNOWN_CATEGORY_LABELS,
  SALARY_TEMPLATE_75,
  displayCategoryLabel,
  expenseCategories,
  getCategoriesByGroup,
  isUncategorized
} from "./categories";

// Salinan tepira lib/categories.ts (tepira 17dac72, backlog #6). Ubah keduanya bersamaan.
const TEPIRA = [
  ["makan_harian", "Makan harian", "Kebutuhan wajib"],
  ["transport", "Transport", "Kebutuhan wajib"],
  ["pulsa_internet", "Pulsa & Internet", "Kebutuhan wajib"],
  ["listrik_kos", "Listrik / Air / Kos", "Kebutuhan wajib"],
  ["langganan", "Langganan (Spotify, Netflix, dll)", "Kewajiban & rutin"],
  ["kesehatan", "Kesehatan / Obat", "Kewajiban & rutin"],
  ["sosial", "Sosial (sedekah / bantu keluarga)", "Kewajiban & rutin"],
  ["biaya_admin", "Biaya admin & bank", "Kewajiban & rutin"],
  ["nongkrong", "Nongkrong / jajan", "Hiburan & fleksibel"],
  ["belanja_kecil", "Belanja kecil", "Hiburan & fleksibel"],
  ["lainnya", "Lainnya", "Hiburan & fleksibel"]
];

test("daftar kategori sama dengan tepira (key, label, grup, urutan)", () => {
  assert.deepEqual(expenseCategories.map((c) => [c.key, c.label, c.group]), TEPIRA);
  assert.deepEqual(Object.keys(getCategoriesByGroup()), ["Kebutuhan wajib", "Kewajiban & rutin", "Hiburan & fleksibel"]);
  assert.equal(KNOWN_CATEGORY_LABELS.size, 11);
});

test("template simulasi: kategori baru 0, total tetap seperti tepira", () => {
  assert.equal(SALARY_TEMPLATE_75.allocations.biaya_admin, 0);
  assert.equal(SALARY_TEMPLATE_75.allocations.lainnya, 0);
  const expense = Object.values(SALARY_TEMPLATE_75.allocations).reduce((s, v) => s + v, 0);
  assert.equal(expense, 4_500_000);
  assert.equal(expense + SALARY_TEMPLATE_75.savings, 7_500_000);
});

test("T3: semua bentuk 'tanpa kategori' disatukan saat ditampilkan; Lainnya tetap kategori", () => {
  for (const raw of [null, undefined, "", "  ", "Uncategorized", "uncategorized", "Tanpa kategori"]) {
    assert.equal(isUncategorized(raw), true, String(raw));
    assert.equal(displayCategoryLabel(raw), "Tanpa kategori", String(raw));
  }
  assert.equal(isUncategorized("Lainnya"), false);
  assert.equal(displayCategoryLabel("Lainnya"), "Lainnya");
  assert.equal(displayCategoryLabel("lainnya"), "Lainnya");
  assert.equal(displayCategoryLabel(" biaya_admin "), "Biaya admin & bank");
  assert.equal(displayCategoryLabel("Hobi"), "Hobi");
});
