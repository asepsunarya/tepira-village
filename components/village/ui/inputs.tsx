"use client";

import { expenseCategories } from "@/lib/categories";
import { useMoneyVisible, useVillage } from "../store";

/**
 * Input nominal rupiah dengan pemisah ribuan. Ikut mode sembunyikan angka seperti
 * SensitiveInput di tepira: saat nominal disembunyikan, isinya ditutup dan tidak bisa diubah.
 */
export function AmountInput({
  value,
  onChange,
  placeholder = "0",
  autoFocus,
  compact = false,
  ariaLabel
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Versi kecil untuk baris-baris alokasi. */
  compact?: boolean;
  ariaLabel?: string;
}) {
  const visible = useMoneyVisible();
  const unlocked = useVillage((s) => s.unlocked);
  const toggleUi = useVillage((s) => s.toggleUi);

  if (!visible) {
    return (
      <>
        <div className={`amount-input locked ${compact ? "compact" : ""}`} title="Nominal disembunyikan">
          <span>Rp</span>
          <input readOnly value="••••••" aria-label={`${ariaLabel ?? "Nominal"} (disembunyikan)`} />
          <span aria-hidden>🔒</span>
        </div>
        {!compact &&
          (unlocked ? (
            <button type="button" className="link-btn amount-reveal" onClick={() => toggleUi("hideMoney")}>
              👁️ Tampilkan nominal untuk mengubah
            </button>
          ) : (
            <small className="muted">Masukkan PIN untuk mengubah nominal.</small>
          ))}
      </>
    );
  }

  return (
    <div className={`amount-input ${compact ? "compact" : ""}`}>
      <span>Rp</span>
      <input
        inputMode="numeric"
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value ? value.toLocaleString("id-ID") : ""}
        onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
      />
    </div>
  );
}

/** Kategori pengeluaran dikelompokkan per grup (urutan sama dengan tepira). */
export const CATEGORY_GROUPS = (() => {
  const g: Record<string, { key: string; label: string }[]> = {};
  for (const c of expenseCategories) (g[c.group] ??= []).push({ key: c.key, label: c.label });
  return g;
})();
