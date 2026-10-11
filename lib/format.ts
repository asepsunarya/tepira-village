const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
});

export function formatRupiah(amount: number) {
  return idr.format(amount);
}

/** "Rp1,2 jt", "Rp850 rb", "Rp12 M" – untuk label kecil di dunia 3D. */
export function formatCompact(amount: number) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  const fmt = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: n < 10 ? 1 : 0 });
  if (abs >= 1_000_000_000) return `${sign}Rp${fmt(abs / 1_000_000_000)} M`;
  if (abs >= 1_000_000) return `${sign}Rp${fmt(abs / 1_000_000)} jt`;
  if (abs >= 1_000) return `${sign}Rp${fmt(abs / 1_000)} rb`;
  return `${sign}Rp${abs}`;
}

export const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

export function monthLabel(month: number, year: number) {
  return `${MONTHS_ID[month - 1] ?? month} ${year}`;
}

export function shortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export function timeAgo(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s} dtk lalu`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} jam lalu`;
  return `${Math.round(h / 24)} hari lalu`;
}

/** Nilai input "yyyy-mm-dd" untuk hari ini (zona lokal). */
export function todayInputValue() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Tanggal default untuk mencatat di bulan yang sedang dilihat: hari ini kalau bulan berjalan,
 * tanggal terakhir untuk bulan lalu, tanggal 1 untuk bulan depan.
 */
export function defaultInputDateFor(month: number, year: number) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (month === now.getMonth() + 1 && year === now.getFullYear()) return todayInputValue();
  const past = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);
  const day = past ? new Date(year, month, 0).getDate() : 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** ISO → nilai <input type="date"> dalam zona waktu lokal. */
export function dateInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
