"use client";

import { useState, type FormEvent } from "react";
import type { ExpenseView, SalaryView, Snapshot } from "@/lib/game";
import { KNOWN_CATEGORY_LABELS, SALARY_TEMPLATE_75, expenseCategories, getCategoryLabel } from "@/lib/categories";
import { monthLabel } from "@/lib/format";
import { useMoneyVisible, useVillage } from "../store";
import { Money } from "./Money";
import { AmountInput, CATEGORY_GROUPS } from "./inputs";

const GROUP_COLORS: Record<string, string> = {
  "Kebutuhan wajib": "#7cc3e8",
  "Kewajiban & rutin": "#b391f0",
  "Hiburan & fleksibel": "#f0a06a"
};
const EXTRA_GROUP = "Kategori lain";
const EXTRA_COLOR = "#e9c46a";
const SAVINGS_LABEL = "Tabungan & dana aman";
const SAVINGS_COLOR = "#6cc8ad";
const KNOWN_LABELS = expenseCategories.map((c) => c.label);

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const pctText = (part: number, whole: number) => `${pct(part, whole).toLocaleString("id-ID")}%`;

/** Persentase ikut mode sembunyikan angka: rasionya saja sudah membocorkan pembagian gaji. */
function Pct({ part, whole }: { part: number; whole: number }) {
  const visible = useMoneyVisible();
  return <>{visible ? pctText(part, whole) : "••%"}</>;
}

/** Warna bar pemakaian: aman → hampir habis → lewat. */
const usageColor = (ratio: number) => (ratio > 1 ? "#e86d6d" : ratio >= 0.8 ? "#e0b84a" : "#6cc8ad");

// ── Hitungan bersama ─────────────────────────────────────────────────────────

/**
 * Jatah vs realisasi per kategori (pakai label, kategori lama berupa key ikut
 * diterjemahkan). Hanya pengeluaran bersumber gaji yang dihitung ke jatah gaji.
 */
export function salaryUsage(salary: SalaryView, expenses: ExpenseView[]) {
  const allocated = new Map<string, number>();
  for (const a of salary.allocations) {
    const label = getCategoryLabel(a.category.trim()) || "Lainnya";
    allocated.set(label, (allocated.get(label) ?? 0) + a.amount);
  }
  const spent = new Map<string, number>();
  let bonusSpent = 0;
  for (const e of expenses) {
    if (e.source === "bonus") {
      bonusSpent += e.amount;
      continue;
    }
    const label = e.category ? getCategoryLabel(e.category) : "Lainnya";
    spent.set(label, (spent.get(label) ?? 0) + e.amount);
  }
  return { allocated, spent, bonusSpent };
}

interface Draft {
  amount: number;
  savings: number;
  /** nominal per label kategori */
  values: Record<string, number>;
  /** kategori di luar sembilan kategori tepira (data lama), tetap ditampilkan supaya tidak hilang */
  extras: string[];
}

function draftFrom(salary: SalaryView | null): Draft {
  const values: Record<string, number> = {};
  const extras: string[] = [];
  for (const a of salary?.allocations ?? []) {
    const label = getCategoryLabel(a.category.trim()) || "Lainnya";
    values[label] = (values[label] ?? 0) + a.amount;
    if (!KNOWN_CATEGORY_LABELS.has(label) && !extras.includes(label)) extras.push(label);
  }
  return { amount: salary?.amount ?? 0, savings: salary?.savingsAllocation ?? 0, values, extras };
}

/** Pastikan baris kategori lama tetap tampil (nilai 0) setelah template diterapkan. */
function withExtras(draft: Draft, extras: string[]): Draft {
  const merged = [...draft.extras];
  for (const e of extras) if (!merged.includes(e)) merged.push(e);
  return { ...draft, extras: merged };
}

function templateDraft(): Draft {
  const values: Record<string, number> = {};
  for (const c of expenseCategories) values[c.label] = SALARY_TEMPLATE_75.allocations[c.key];
  return { amount: SALARY_TEMPLATE_75.salary, savings: SALARY_TEMPLATE_75.savings, values, extras: [] };
}

/** Proporsi simulasi tepira diskalakan ke gaji, dibulatkan ke bawah per Rp1.000, sisanya ke tabungan. */
function autoSplitDraft(amount: number): Draft {
  const values: Record<string, number> = {};
  let used = 0;
  for (const c of expenseCategories) {
    const v = Math.floor((amount * SALARY_TEMPLATE_75.allocations[c.key]) / SALARY_TEMPLATE_75.salary / 1000) * 1000;
    values[c.label] = v;
    used += v;
  }
  return { amount, savings: amount - used, values, extras: [] };
}

function splitParts(values: Record<string, number>, extras: string[], savings: number) {
  const sum = (labels: string[]) => labels.reduce((s, l) => s + (values[l] ?? 0), 0);
  return [
    ...Object.entries(CATEGORY_GROUPS).map(([group, items]) => ({
      key: group,
      color: GROUP_COLORS[group] ?? EXTRA_COLOR,
      value: sum(items.map((i) => i.label))
    })),
    { key: EXTRA_GROUP, color: EXTRA_COLOR, value: sum(extras) },
    { key: SAVINGS_LABEL, color: SAVINGS_COLOR, value: savings }
  ];
}

function SplitBar({ parts, base }: { parts: ReturnType<typeof splitParts>; base: number }) {
  return (
    <div className="split-bar" aria-hidden>
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <div key={p.key} title={p.key} style={{ width: `${base > 0 ? (p.value / base) * 100 : 0}%`, background: p.color }} />
        ))}
    </div>
  );
}

// ── Petunjuk di form Catat pengeluaran ───────────────────────────────────────

export function CategoryBudgetHint({
  salary,
  expenses,
  category,
  amount
}: {
  salary: SalaryView;
  expenses: ExpenseView[];
  category: string;
  amount: number;
}) {
  const label = getCategoryLabel(category);
  const { allocated, spent } = salaryUsage(salary, expenses);
  const budget = allocated.get(label) ?? 0;
  if (budget <= 0) return <p className="cat-hint">{label} belum dapat jatah di alokasi gaji bulan ini.</p>;
  const left = budget - (spent.get(label) ?? 0);
  const after = left - amount;
  return (
    <p className={`cat-hint ${left < 0 ? "over" : after < 0 ? "warn" : "ok"}`}>
      {left >= 0 ? (
        <>Sisa budget {label}: <b><Money value={left} /></b></>
      ) : (
        <>Lewat <b><Money value={-left} /></b> dari budget {label}</>
      )}
      {left >= 0 && amount > 0 && after < 0 && (
        <> · nominal ini bikin lewat <Money value={-after} /></>
      )}
    </p>
  );
}

// ── Mode lihat ───────────────────────────────────────────────────────────────

function SalaryOverview({
  salary,
  expenses,
  period,
  onEdit
}: {
  salary: SalaryView;
  expenses: ExpenseView[];
  period: Snapshot["period"];
  onEdit: () => void;
}) {
  const deleteSalary = useVillage((s) => s.deleteSalary);
  const loading = useVillage((s) => s.loading);
  const visible = useMoneyVisible();
  const [confirm, setConfirm] = useState(false);
  const draft = draftFrom(salary);
  const parts = splitParts(draft.values, draft.extras, salary.savingsAllocation);
  const { allocated, spent, bonusSpent } = salaryUsage(salary, expenses);
  const rows = [...KNOWN_LABELS, ...draft.extras].filter((c) => (allocated.get(c) ?? 0) > 0);
  const outside = [...spent].filter(([c]) => !((allocated.get(c) ?? 0) > 0)).sort((a, b) => b[1] - a[1]);
  const totalSpent = [...spent.values()].reduce((s, v) => s + v, 0);
  const totalRatio = salary.totalExpenseAllocation > 0 ? totalSpent / salary.totalExpenseAllocation : totalSpent > 0 ? 2 : 0;

  return (
    <>
      <p className="intro">Gaji {monthLabel(period.month, period.year)} sudah dibagi. Pantau tiap pos biar nggak jebol 😉</p>
      <div className="detail-grid salary-totals" data-tour="salary-overview">
        <div><small>Gaji</small><b><Money value={salary.amount} /></b></div>
        <div><small>Pengeluaran</small><b className="spend-text"><Money value={salary.totalExpenseAllocation} /></b></div>
        <div><small>Tabungan</small><b className="save-text"><Money value={salary.savingsAllocation} /></b></div>
      </div>
      <div className="salary-split">
        <SplitBar parts={parts} base={salary.amount} />
        <div className="split-legend">
          {parts
            .filter((p) => p.value > 0)
            .map((p) => (
              <span key={p.key}>
                <i style={{ background: p.color }} /> {p.key} <b><Pct part={p.value} whole={salary.amount} /></b>
              </span>
            ))}
        </div>
      </div>
      <button className="primary" onClick={onEdit}>✏️ Ubah alokasi</button>

      <section className="salary-cats">
        <h3>Jatah vs realisasi</h3>
        <div className="cat-row total">
          <div className="cat-head">
            <span>Semua pengeluaran dari gaji</span>
            <b><Money value={totalSpent} /> <span className="muted">/</span> <Money value={salary.totalExpenseAllocation} /></b>
          </div>
          <div className="bar thin">
            <div style={{ width: `${Math.min(100, totalRatio * 100)}%`, background: usageColor(totalRatio) }} />
          </div>
        </div>
        {rows.length === 0 && <p className="muted">Belum ada kategori yang dapat jatah.</p>}
        {rows.map((c) => {
          const budget = allocated.get(c) ?? 0;
          const used = spent.get(c) ?? 0;
          const ratio = used / budget;
          const over = used > budget;
          return (
            <div key={c} className={`cat-row ${over ? "over" : ""}`}>
              <div className="cat-head">
                <span>{c}</span>
                <b><Money value={used} /> <span className="muted">/</span> <Money value={budget} /></b>
              </div>
              <div className="bar thin">
                <div style={{ width: `${Math.min(100, ratio * 100)}%`, background: usageColor(ratio) }} />
              </div>
              <small className={`cat-sub ${over ? "spend-text" : "muted"}`}>
                {over ? <>Lewat <Money value={used - budget} /></> : <>Sisa <Money value={budget - used} /></>}
                {" · "}{visible ? `${Math.round(ratio * 100)}%` : "••%"} terpakai
              </small>
            </div>
          );
        })}
      </section>

      {outside.length > 0 && (
        <section className="salary-cats">
          <h3>Di luar alokasi <span className="count">{outside.length}</span></h3>
          {outside.map(([c, used]) => (
            <div key={c} className="cat-row over">
              <div className="cat-head">
                <span>{c}</span>
                <b className="spend-text"><Money value={used} /></b>
              </div>
              <small className="cat-sub muted">Kategori ini belum dapat jatah dari gaji.</small>
            </div>
          ))}
        </section>
      )}
      {bonusSpent > 0 && (
        <p className="muted small">
          Pengeluaran dari bonus (<Money value={bonusSpent} />) tidak dihitung ke jatah gaji.
        </p>
      )}

      <section className="danger-zone">
        {confirm ? (
          <div className="confirm-row">
            <span>Hapus alokasi gaji {monthLabel(period.month, period.year)}?</span>
            {/* Hapus persis baris yang sedang ditampilkan (sama seperti tepira: berdasarkan id). */}
            <button className="pill danger" disabled={loading} onClick={() => void deleteSalary(salary.id)}>Ya, hapus</button>
            <button className="pill ghost" onClick={() => setConfirm(false)}>Batal</button>
          </div>
        ) : (
          <button className="link-btn danger" onClick={() => setConfirm(true)}>Hapus alokasi gaji bulan ini</button>
        )}
      </section>
    </>
  );
}

// ── Mode ubah / kosong ───────────────────────────────────────────────────────

function AllocRow({
  label,
  value,
  salary,
  hint,
  onChange
}: {
  label: string;
  value: number;
  salary: number;
  hint?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="alloc-row">
      <span className="alloc-name">
        {label} <span className="alloc-pct"><Pct part={value} whole={salary} /></span>
        {hint && <small className="muted block">{hint}</small>}
      </span>
      <AmountInput compact value={value} onChange={onChange} ariaLabel={`Alokasi ${label}`} />
    </label>
  );
}

function SalaryForm({
  salary,
  previous,
  period,
  onCancel,
  onSaved
}: {
  salary: SalaryView | null;
  previous: Snapshot["previousSalary"];
  period: Snapshot["period"];
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const saveSalary = useVillage((s) => s.saveSalary);
  const loading = useVillage((s) => s.loading);
  // Nominal disembunyikan → input terkunci, jadi jangan simpan angka yang tidak kelihatan.
  const visible = useMoneyVisible();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(salary));
  const { amount, savings, values, extras } = draft;
  const categories = [...KNOWN_LABELS, ...extras];
  const expenseTotal = categories.reduce((s, c) => s + (values[c] ?? 0), 0);
  const allocated = expenseTotal + savings;
  const remaining = amount - allocated;
  const tone = amount > 0 && remaining === 0 ? "ok" : remaining < 0 ? "over" : "left";
  const parts = splitParts(values, extras, savings);

  const setValue = (category: string, v: number) =>
    setDraft((d) => ({ ...d, values: { ...d.values, [category]: v } }));
  const apply = (next: Draft) => setDraft((d) => withExtras(next, d.extras));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!visible || amount <= 0 || remaining !== 0) return;
    const ok = await saveSalary({
      amount,
      savingsAllocation: savings,
      allocations: categories.map((category) => ({ category, amount: values[category] ?? 0 }))
    });
    if (ok) onSaved();
  };

  return (
    <form className="add-form salary-form" onSubmit={submit} data-tour="salary-form">
      <p className="intro">
        {salary
          ? "Ubah jatah tiap pos. Totalnya tetap harus pas sama gaji, ya."
          : `Gaji ${monthLabel(period.month, period.year)} belum dibagi. Yuk kasih tiap rupiah tugasnya, dari makan harian sampai tabungan. Totalnya harus pas sama gaji.`}
      </p>
      <label data-tour="salary-amount">
        Gaji {monthLabel(period.month, period.year)}
        <AmountInput value={amount} onChange={(v) => setDraft((d) => ({ ...d, amount: v }))} placeholder="7.500.000" />
      </label>
      <div className="chips" data-tour="salary-quick">
        <button type="button" className="pill" onClick={() => apply(templateDraft())}>
          🧪 Pakai simulasi Rp7.500.000
        </button>
        <button
          type="button"
          className="pill"
          disabled={amount <= 0}
          onClick={() => apply(autoSplitDraft(amount))}
          title="Pakai proporsi simulasi tepira untuk gajimu, sisanya masuk tabungan"
        >
          ⚖️ Bagi otomatis
        </button>
        {previous && (
          <button type="button" className="pill" onClick={() => apply(draftFrom(previous))}>
            📋 Salin dari {monthLabel(previous.month, previous.year)}
          </button>
        )}
      </div>
      {amount > 0 && allocated === 0 && (
        <small className="muted">Bingung mulai dari mana? Tekan ⚖️ Bagi otomatis, lalu sesuaikan sedikit-sedikit.</small>
      )}

      {Object.entries(CATEGORY_GROUPS).map(([group, items]) => {
        const sub = items.reduce((s, c) => s + (values[c.label] ?? 0), 0);
        return (
          <div key={group} className="alloc-group">
            <div className="alloc-group-head">
              <i style={{ background: GROUP_COLORS[group] ?? EXTRA_COLOR }} />
              <span>{group}</span>
              <span className="alloc-pct"><Pct part={sub} whole={amount} /></span>
            </div>
            {items.map((c) => (
              <AllocRow key={c.key} label={c.label} value={values[c.label] ?? 0} salary={amount} onChange={(v) => setValue(c.label, v)} />
            ))}
          </div>
        );
      })}

      {extras.length > 0 && (
        <div className="alloc-group">
          <div className="alloc-group-head">
            <i style={{ background: EXTRA_COLOR }} />
            <span>{EXTRA_GROUP}</span>
            <span className="alloc-pct"><Pct part={extras.reduce((s, c) => s + (values[c] ?? 0), 0)} whole={amount} /></span>
          </div>
          {extras.map((c) => (
            <AllocRow
              key={c}
              label={c}
              value={values[c] ?? 0}
              salary={amount}
              hint="Kategori lama dari tepira. Isi 0 untuk menghapusnya."
              onChange={(v) => setValue(c, v)}
            />
          ))}
        </div>
      )}

      <div className="alloc-group savings">
        <div className="alloc-group-head">
          <i style={{ background: SAVINGS_COLOR }} />
          <span>{SAVINGS_LABEL}</span>
          <span className="alloc-pct"><Pct part={savings} whole={amount} /></span>
        </div>
        <AllocRow
          label="Total tabungan bulanan"
          value={savings}
          salary={amount}
          hint="Tabungan utama + dana darurat"
          onChange={(v) => setDraft((d) => ({ ...d, savings: v }))}
        />
        <button
          type="button"
          className="pill"
          disabled={remaining === 0 || (remaining < 0 && savings === 0)}
          onClick={() => setDraft((d) => ({ ...d, savings: Math.max(0, d.savings + remaining) }))}
        >
          🐷 Masukkan sisa ke tabungan
        </button>
      </div>

      <div className={`alloc-footer ${tone}`} data-tour="salary-footer" data-ready={amount > 0 && remaining === 0 ? "" : undefined}>
        <div className="alloc-footer-head">
          <span>
            Teralokasi <b><Money value={allocated} /></b> <span className="muted">dari</span> <b><Money value={amount} /></b>
          </span>
        </div>
        <SplitBar parts={parts} base={Math.max(amount, allocated)} />
        <p className="alloc-status">
          {amount <= 0 ? (
            "Isi nominal gaji dulu, ya."
          ) : remaining === 0 ? (
            "✅ Pas! Semua gaji sudah punya tugas."
          ) : remaining > 0 ? (
            <>Sisa belum dialokasikan <b><Money value={remaining} /></b></>
          ) : (
            <>Kelebihan <b><Money value={-remaining} /></b> dari gaji</>
          )}
        </p>
        <div className="alloc-actions">
          <button
            className="primary"
            type="submit"
            data-tour="salary-save"
            disabled={loading || !visible || amount <= 0 || remaining !== 0}
            title={visible ? undefined : "Tampilkan nominal dulu untuk menyimpan"}
          >
            💾 Simpan<span className="alloc-save-word"> alokasi</span>
          </button>
          {onCancel && (
            <button type="button" className="pill ghost" onClick={onCancel}>Batal</button>
          )}
        </div>
      </div>
    </form>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

function SalaryPanelBody() {
  const snapshot = useVillage((s) => s.snapshot);
  const [editing, setEditing] = useState(false);
  if (!snapshot) return null;
  const { salary, previousSalary, expenses, period } = snapshot;
  if (salary && !editing) {
    // key: baris lain (mis. baris lama) yang muncul setelah hapus mulai tanpa konfirmasi menyala.
    return (
      <SalaryOverview key={salary.id} salary={salary} expenses={expenses} period={period} onEdit={() => setEditing(true)} />
    );
  }
  return (
    <SalaryForm
      key={salary?.id ?? "baru"}
      salary={salary}
      previous={previousSalary}
      period={period}
      onCancel={salary ? () => setEditing(false) : undefined}
      onSaved={() => setEditing(false)}
    />
  );
}

export default function SalaryPanel() {
  const period = useVillage((s) => s.snapshot?.period);
  if (!period) return null;
  // Ganti bulan = mulai bersih (mode lihat, draft baru).
  return <SalaryPanelBody key={`${period.year}-${period.month}`} />;
}
