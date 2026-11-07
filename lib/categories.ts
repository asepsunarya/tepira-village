// Shared categories untuk budget dan expenses.
// Salinan dari tepira lib/categories.ts (key, label, grup, urutan sama); ubah
// bersamaan dengan tepira dan tepira-mobile (lib/core/categories.dart).
// lib/categories.test.ts mengecek salinan ini.
//
// biaya_admin masuk "Kewajiban & rutin"; lainnya masuk "Hiburan & fleksibel"
// (pengeluaran sekali-sekali itu fleksibel), jadi grupnya tetap tiga.
// "Lainnya" adalah kategori yang dipilih, BUKAN "tanpa kategori": untuk itu
// pakai UNCATEGORIZED_LABEL / displayCategoryLabel di bawah.

export const expenseCategories = [
  // 1️⃣ Kebutuhan Wajib
  { key: "makan_harian", label: "Makan harian", group: "Kebutuhan wajib" },
  { key: "transport", label: "Transport", group: "Kebutuhan wajib" },
  {
    key: "pulsa_internet",
    label: "Pulsa & Internet",
    group: "Kebutuhan wajib"
  },
  {
    key: "listrik_kos",
    label: "Listrik / Air / Kos",
    group: "Kebutuhan wajib"
  },
  // 2️⃣ Kewajiban & Rutin
  {
    key: "langganan",
    label: "Langganan (Spotify, Netflix, dll)",
    group: "Kewajiban & rutin"
  },
  { key: "kesehatan", label: "Kesehatan / Obat", group: "Kewajiban & rutin" },
  {
    key: "sosial",
    label: "Sosial (sedekah / bantu keluarga)",
    group: "Kewajiban & rutin"
  },
  { key: "biaya_admin", label: "Biaya admin & bank", group: "Kewajiban & rutin" },
  // 4️⃣ Hiburan & Fleksibel
  { key: "nongkrong", label: "Nongkrong / jajan", group: "Hiburan & fleksibel" },
  { key: "belanja_kecil", label: "Belanja kecil", group: "Hiburan & fleksibel" },
  { key: "lainnya", label: "Lainnya", group: "Hiburan & fleksibel" }
] as const;

export type ExpenseCategoryKey = (typeof expenseCategories)[number]["key"];

// Helper untuk mendapatkan label dari key
export function getCategoryLabel(key: string): string {
  const category = expenseCategories.find((cat) => cat.key === key);
  return category?.label || key;
}

// Helper untuk mendapatkan semua label (untuk dropdown)
export function getCategoryLabels(): string[] {
  return expenseCategories.map((cat) => cat.label);
}

// Helper untuk mendapatkan kategori berdasarkan group
export function getCategoriesByGroup() {
  const grouped: Record<string, Array<typeof expenseCategories[number]>> = {};
  expenseCategories.forEach((cat) => {
    if (!grouped[cat.group]) {
      grouped[cat.group] = [];
    }
    grouped[cat.group].push(cat);
  });
  return grouped;
}


// "Tanpa kategori" tersimpan dalam beberapa bentuk: null, "" (form web),
// "Uncategorized" (OpenClaw) dan "Tanpa kategori". Data tidak diubah; semua
// bentuk itu disatukan saat ditampilkan (sama seperti tepira lib/categories.ts).
export const UNCATEGORIZED_LABEL = "Tanpa kategori";

export function isUncategorized(raw: string | null | undefined): boolean {
  if (raw == null) return true;
  const v = raw.trim().toLowerCase();
  return v === "" || v === "uncategorized" || v === "tanpa kategori";
}

/** Label untuk ditampilkan: key lama → label, semua bentuk "tanpa kategori" → UNCATEGORIZED_LABEL, sisanya apa adanya (dirapikan). */
export function displayCategoryLabel(raw: string | null | undefined): string {
  if (raw == null || isUncategorized(raw)) return UNCATEGORIZED_LABEL;
  return getCategoryLabel(raw.trim());
}

/** Label kategori yang dikenal (dipakai untuk menyimpan alokasi gaji, sama seperti tepira). */
export const KNOWN_CATEGORY_LABELS: ReadonlySet<string> = new Set(expenseCategories.map((c) => c.label));

/**
 * Simulasi gaji Rp7.500.000 — disalin dari TEMPLATE_75 di tepira
 * (app/budget/components/BudgetForm.tsx). Tabungan = tabungan utama + dana darurat.
 */
export const SALARY_TEMPLATE_75 = {
  salary: 7_500_000,
  allocations: {
    makan_harian: 1_800_000,
    transport: 600_000,
    pulsa_internet: 450_000,
    listrik_kos: 600_000,
    langganan: 200_000,
    kesehatan: 200_000,
    sosial: 300_000,
    biaya_admin: 0,
    nongkrong: 250_000,
    belanja_kecil: 100_000,
    lainnya: 0
  } satisfies Record<ExpenseCategoryKey, number>,
  savings: 2_500_000 + 500_000
};
