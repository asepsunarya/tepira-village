// Shared categories untuk budget dan expenses
// Harus sama persis dengan kategori di BudgetForm

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
  // 4️⃣ Hiburan & Fleksibel
  { key: "nongkrong", label: "Nongkrong / jajan", group: "Hiburan & fleksibel" },
  { key: "belanja_kecil", label: "Belanja kecil", group: "Hiburan & fleksibel" }
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

