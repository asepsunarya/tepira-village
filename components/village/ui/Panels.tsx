"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { GoalView, WalletView } from "@/lib/game";
import { WALLET_TYPES, buildStage, walletEmoji } from "@/lib/game";
import { expenseCategories } from "@/lib/categories";
import { formatRupiah, monthLabel, shortDate, timeAgo, todayInputValue } from "@/lib/format";
import { useVillage } from "../store";
import { Money } from "./Money";

const QUICK_AMOUNTS = [5_000, 10_000, 20_000, 50_000, 100_000, 500_000];

/** Input nominal rupiah dengan pemisah ribuan. */
function AmountInput({
  value,
  onChange,
  placeholder = "0",
  autoFocus
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="amount-input">
      <span>Rp</span>
      <input
        inputMode="numeric"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value ? value.toLocaleString("id-ID") : ""}
        onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
      />
    </div>
  );
}

function PanelShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <aside className="panel card">
      <header>
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose} title="Tutup">✕</button>
      </header>
      <div className="panel-body">{children}</div>
    </aside>
  );
}

// ── Goals ────────────────────────────────────────────────────────────────────

function GoalRow({ goal, selected, onSelect }: { goal: GoalView; selected: boolean; onSelect: () => void }) {
  const pct = Math.round(goal.progress * 100);
  const done = goal.progress >= 1;
  return (
    <div className={`task-row ${selected ? "on" : ""} ${done ? "status-done" : ""}`} onClick={onSelect} role="button">
      <div className="task-main">
        <div className="task-title">
          {done ? "🏡" : "🏗️"} {goal.title} <span className="status-chip">{pct}%</span>
        </div>
        <div className="task-meta">
          <Money value={goal.saved} /> <span className="muted">dari</span> <Money value={goal.targetAmount} />
          {goal.deadline && <span className="muted">· target {shortDate(goal.deadline)}</span>}
        </div>
        <div className="bar">
          <div style={{ width: `${pct}%`, background: done ? "#6cc8ad" : "#f28cb4" }} />
        </div>
      </div>
    </div>
  );
}

function GoalDetail({ goal }: { goal: GoalView }) {
  const openGoal = useVillage((s) => s.openGoal);
  const setPanel = useVillage((s) => s.setPanel);
  const deleteGoal = useVillage((s) => s.deleteGoal);
  const deleteContribution = useVillage((s) => s.deleteContribution);
  const [confirm, setConfirm] = useState(false);
  const pct = Math.round(goal.progress * 100);
  const remaining = Math.max(0, goal.targetAmount - goal.saved);
  const stage = buildStage(goal.progress);
  const stageText: Record<typeof stage, string> = {
    lahan: "Kavling masih kosong. Setoran pertama akan memasang fondasinya.",
    fondasi: "Fondasi sudah terpasang. Terus setor supaya dindingnya naik.",
    dinding: "Dinding sedang naik. Sedikit lagi atapnya terpasang!",
    atap: "Atap sedang dipasang. Tinggal finishing!",
    selesai: "Bangunan selesai. Goal ini tercapai 🎉"
  };
  return (
    <>
      <button className="link-btn" onClick={() => openGoal(null)}>← Semua goal</button>
      <h3 className="detail-title">{goal.title}</h3>
      {goal.description && <p className="task-desc">{goal.description}</p>}
      <div className="bar">
        <div style={{ width: `${pct}%`, background: goal.progress >= 1 ? "#6cc8ad" : "#f28cb4" }} />
      </div>
      <div className="detail-grid">
        <div><small>Terkumpul</small><b><Money value={goal.saved} /></b></div>
        <div><small>Target</small><b><Money value={goal.targetAmount} /></b></div>
        <div><small>Sisa</small><b><Money value={remaining} /></b></div>
        <div><small>Setoran</small><b>{goal.contributions.length}x</b></div>
      </div>
      <p className="stage-note">🏗️ {stageText[stage]}</p>
      {goal.progress < 1 && (
        <button className="primary" onClick={() => setPanel("save")}>🪙 Nabung ke goal ini</button>
      )}

      <section>
        <h3>Riwayat setoran</h3>
        {goal.contributions.length === 0 && <p className="muted">Belum ada setoran. Mulai dari yang teu pira!</p>}
        <div className="log-list">
          {goal.contributions.map((c) => (
            <div key={c.id} className="log-row">
              <span className="muted">{shortDate(c.date)}</span>
              <span className="log-text">
                <b className="save-text"><Money value={c.amount} signed /></b>
                {c.note && <span className="muted"> · {c.note}</span>}
              </span>
              <button className="icon-btn danger small" title="Hapus setoran" onClick={() => void deleteContribution(c.id)}>🗑</button>
            </div>
          ))}
        </div>
      </section>

      <section className="danger-zone">
        {confirm ? (
          <div className="confirm-row">
            <span>Hapus goal beserta semua setorannya?</span>
            <button className="pill danger" onClick={() => void deleteGoal(goal.id)}>Ya, hapus</button>
            <button className="pill ghost" onClick={() => setConfirm(false)}>Batal</button>
          </div>
        ) : (
          <button className="link-btn danger" onClick={() => setConfirm(true)}>Hapus goal ini</button>
        )}
      </section>
    </>
  );
}

function NewGoalForm({ onDone }: { onDone: () => void }) {
  const createGoal = useVillage((s) => s.createGoal);
  const loading = useVillage((s) => s.loading);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState(0);
  const [deadline, setDeadline] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || target <= 0) return;
    const ok = await createGoal({ title, description, targetAmount: target, deadline: deadline || undefined });
    if (ok) {
      setTitle("");
      setDescription("");
      setTarget(0);
      setDeadline("");
      onDone();
    }
  };
  return (
    <form className="add-form" onSubmit={submit}>
      <label>
        Nama goal
        <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Dana darurat 3 bulan" />
      </label>
      <label>
        Target
        <AmountInput value={target} onChange={setTarget} placeholder="5.000.000" />
      </label>
      <label>
        Deskripsi (opsional)
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Kenapa goal ini penting?" />
      </label>
      <label>
        Target tanggal (opsional)
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </label>
      <button className="primary" type="submit" disabled={loading || !title.trim() || target <= 0}>
        🏗️ Buka kavling baru
      </button>
    </form>
  );
}

function GoalsPanel() {
  const goals = useVillage((s) => s.snapshot?.goals ?? []);
  const selectedId = useVillage((s) => s.selectedGoalId);
  const openGoal = useVillage((s) => s.openGoal);
  const [adding, setAdding] = useState(false);
  const selected = goals.find((g) => g.id === selectedId);
  if (selected) return <GoalDetail goal={selected} />;
  const active = goals.filter((g) => g.progress < 1);
  const done = goals.filter((g) => g.progress >= 1);
  return (
    <>
      {adding ? (
        <section>
          <button className="link-btn" onClick={() => setAdding(false)}>← Batal</button>
          <NewGoalForm onDone={() => setAdding(false)} />
        </section>
      ) : (
        <button className="primary" onClick={() => setAdding(true)}>➕ Goal baru</button>
      )}
      <section>
        <h3>🏗️ Sedang dibangun <span className="count">{active.length}</span></h3>
        {active.length === 0 && <p className="muted">Belum ada goal aktif. Buka kavling pertama!</p>}
        {active.map((g) => (
          <GoalRow key={g.id} goal={g} selected={false} onSelect={() => openGoal(g.id)} />
        ))}
      </section>
      {done.length > 0 && (
        <section>
          <h3>🏡 Selesai <span className="count">{done.length}</span></h3>
          {done.map((g) => (
            <GoalRow key={g.id} goal={g} selected={false} onSelect={() => openGoal(g.id)} />
          ))}
        </section>
      )}
    </>
  );
}

// ── Nabung ───────────────────────────────────────────────────────────────────

function SavePanel() {
  const goals = useVillage((s) => s.snapshot?.goals ?? []);
  const selectedId = useVillage((s) => s.selectedGoalId);
  const save = useVillage((s) => s.save);
  const loading = useVillage((s) => s.loading);
  const setPanel = useVillage((s) => s.setPanel);
  const active = goals.filter((g) => g.progress < 1);
  const [goalId, setGoalId] = useState<number>(selectedId ?? active[0]?.id ?? 0);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (selectedId && goals.some((g) => g.id === selectedId)) setGoalId(selectedId);
  }, [selectedId, goals]);
  useEffect(() => {
    if (!goalId && active[0]) setGoalId(active[0].id);
  }, [goalId, active]);
  const goal = goals.find((g) => g.id === goalId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!goalId || amount <= 0) return;
    const ok = await save({ goalId, amount, note });
    if (ok) {
      setAmount(0);
      setNote("");
    }
  };

  if (goals.length === 0) {
    return (
      <>
        <p className="muted">Belum ada goal. Buat dulu goal tabungan supaya ada bangunan yang bisa didirikan.</p>
        <button className="primary" onClick={() => setPanel("goals")}>🎯 Buat goal</button>
      </>
    );
  }

  return (
    <form className="add-form" onSubmit={submit}>
      <p className="intro">Setoran sekecil apa pun tercatat. Tiap Rp10.000 = 1 XP, tiap setoran +5 XP.</p>
      <label>
        Goal tujuan
        <select value={goalId} onChange={(e) => setGoalId(Number(e.target.value))}>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.progress >= 1 ? "🏡" : "🏗️"} {g.title} ({Math.round(g.progress * 100)}%)
            </option>
          ))}
        </select>
      </label>
      {goal && (
        <div className="bar">
          <div style={{ width: `${Math.round(goal.progress * 100)}%`, background: "#f28cb4" }} />
        </div>
      )}
      <label>
        Nominal
        <AmountInput value={amount} onChange={setAmount} placeholder="10.000" autoFocus />
      </label>
      <div className="chips">
        {QUICK_AMOUNTS.map((q) => (
          <button type="button" key={q} className={`pill ${amount === q ? "on" : ""}`} onClick={() => setAmount(q)}>
            +{formatRupiah(q).replace("Rp", "").replace(/\s/g, "")}
          </button>
        ))}
      </div>
      <label>
        Catatan (opsional)
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sisa uang jajan hari ini" />
      </label>
      <button className="primary" type="submit" disabled={loading || amount <= 0 || !goalId}>
        🪙 Setor {amount > 0 ? formatRupiah(amount) : ""}
      </button>
    </form>
  );
}

// ── Catat pengeluaran ────────────────────────────────────────────────────────

function SpendPanel() {
  const wallets = useVillage((s) => s.snapshot?.wallets ?? []);
  const summary = useVillage((s) => s.snapshot?.summary);
  const spend = useVillage((s) => s.spend);
  const loading = useVillage((s) => s.loading);
  const setPanel = useVillage((s) => s.setPanel);
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState<string>(expenseCategories[0].label);
  const [walletId, setWalletId] = useState<number>(wallets[0]?.id ?? 0);
  const [source, setSource] = useState<"gaji" | "bonus">("gaji");
  const [date, setDate] = useState(todayInputValue());
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!walletId && wallets[0]) setWalletId(wallets[0].id);
  }, [walletId, wallets]);

  const groups = useMemo(() => {
    const g: Record<string, { key: string; label: string }[]> = {};
    for (const c of expenseCategories) (g[c.group] ??= []).push({ key: c.key, label: c.label });
    return g;
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (amount <= 0 || !walletId) return;
    const ok = await spend({ amount, category, note, source, date, walletId });
    if (ok) {
      setAmount(0);
      setNote("");
    }
  };

  if (wallets.length === 0) {
    return (
      <>
        <p className="muted">Pengeluaran harus dipotong dari dompet. Buat dompet dulu, ya.</p>
        <button className="primary" onClick={() => setPanel("wallets")}>👛 Buat dompet</button>
      </>
    );
  }

  return (
    <form className="add-form" onSubmit={submit}>
      {summary && summary.budget.status !== "NO_BUDGET" && (
        <p className={`intro ${summary.budget.status === "OVER_BUDGET" ? "warn" : ""}`}>
          Sisa budget bulan ini: <b><Money value={summary.budget.remaining} /></b>
        </p>
      )}
      <label>
        Nominal
        <AmountInput value={amount} onChange={setAmount} placeholder="25.000" autoFocus />
      </label>
      <label>
        Kategori
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {Object.entries(groups).map(([group, items]) => (
            <optgroup key={group} label={group}>
              {items.map((c) => (
                <option key={c.key} value={c.label}>{c.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label>
        Dompet
        <select value={walletId} onChange={(e) => setWalletId(Number(e.target.value))}>
          {wallets.map((w) => (
            <option key={w.id} value={w.id}>
              {walletEmoji(w.type)} {w.name}
            </option>
          ))}
        </select>
      </label>
      <div className="two-col">
        <label>
          Sumber
          <select value={source} onChange={(e) => setSource(e.target.value as "gaji" | "bonus")}>
            <option value="gaji">Gaji</option>
            <option value="bonus">Bonus</option>
          </select>
        </label>
        <label>
          Tanggal
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label>
        Catatan (opsional)
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Makan siang" />
      </label>
      <button className="primary spend" type="submit" disabled={loading || amount <= 0 || !walletId}>
        💸 Catat {amount > 0 ? formatRupiah(amount) : ""}
      </button>
    </form>
  );
}

// ── Dompet ───────────────────────────────────────────────────────────────────

function WalletForm({ wallet, onDone }: { wallet?: WalletView; onDone: () => void }) {
  const createWallet = useVillage((s) => s.createWallet);
  const updateWallet = useVillage((s) => s.updateWallet);
  const loading = useVillage((s) => s.loading);
  const [name, setName] = useState(wallet?.name ?? "");
  const [type, setType] = useState(wallet?.type ?? "bank");
  const [balance, setBalance] = useState(wallet?.balance ?? 0);
  const [description, setDescription] = useState(wallet?.description ?? "");
  const [isDebt, setIsDebt] = useState(wallet?.isDebt ?? false);
  const forcedDebt = type === "credit" || type === "paylater";
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const input = { name, type, balance, description, isDebt: isDebt || forcedDebt, sortOrder: wallet?.sortOrder ?? 0 };
    const ok = wallet ? await updateWallet(wallet.id, input) : await createWallet(input);
    if (ok) onDone();
  };
  return (
    <form className="add-form" onSubmit={submit}>
      <label>
        Nama dompet
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="BCA, GoPay, Dompet tunai…" />
      </label>
      <div className="two-col">
        <label>
          Jenis
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {WALLET_TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>
            ))}
          </select>
        </label>
        <label>
          {isDebt || forcedDebt ? "Jumlah terutang" : "Saldo"}
          <AmountInput value={balance} onChange={setBalance} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={isDebt || forcedDebt} disabled={forcedDebt} onChange={(e) => setIsDebt(e.target.checked)} />
        Ini dompet utang (saldo dihitung sebagai kewajiban)
      </label>
      <label>
        Catatan (opsional)
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <button className="primary" type="submit" disabled={loading || !name.trim()}>
        {wallet ? "💾 Simpan perubahan" : "👛 Tambah dompet"}
      </button>
    </form>
  );
}

function WalletsPanel() {
  const wallets = useVillage((s) => s.snapshot?.wallets ?? []);
  const totals = useVillage((s) => s.snapshot?.totals);
  const selectedId = useVillage((s) => s.selectedWalletId);
  const openWallet = useVillage((s) => s.openWallet);
  const deleteWallet = useVillage((s) => s.deleteWallet);
  const [mode, setMode] = useState<"list" | "add" | "edit">("list");
  const [confirm, setConfirm] = useState<number | null>(null);
  const selected = wallets.find((w) => w.id === selectedId);

  if (mode === "add") {
    return (
      <>
        <button className="link-btn" onClick={() => setMode("list")}>← Batal</button>
        <WalletForm onDone={() => setMode("list")} />
      </>
    );
  }
  if (mode === "edit" && selected) {
    return (
      <>
        <button className="link-btn" onClick={() => setMode("list")}>← Batal</button>
        <h3 className="detail-title">Ubah {selected.name}</h3>
        <WalletForm key={selected.id} wallet={selected} onDone={() => setMode("list")} />
      </>
    );
  }
  return (
    <>
      {totals && (
        <div className="detail-grid three">
          <div><small>Aset</small><b><Money value={totals.assets} /></b></div>
          <div><small>Utang</small><b className="spend-text"><Money value={totals.debts} /></b></div>
          <div><small>Bersih</small><b><Money value={totals.netWorth} /></b></div>
        </div>
      )}
      <button className="primary" onClick={() => setMode("add")}>➕ Dompet baru</button>
      <section>
        <h3>Peti dompet <span className="count">{wallets.length}</span></h3>
        {wallets.length === 0 && <p className="muted">Belum ada dompet. Dompet dipakai untuk memotong saldo saat mencatat pengeluaran.</p>}
        <div className="agent-list">
          {wallets.map((w) => (
            <div key={w.id} className={`agent-row ${selectedId === w.id ? "on" : ""} ${w.isDebt ? "debt" : ""}`} onClick={() => openWallet(w.id)}>
              <div className="avatar" style={{ background: w.isDebt ? "#f8dede" : "#e3f1ff" }}>{walletEmoji(w.type)}</div>
              <div className="agent-main">
                <div className="agent-head">
                  <b>{w.name}</b>
                  <span className={w.isDebt ? "spend-text" : ""}>
                    {w.isDebt ? "-" : ""}<Money value={Math.abs(w.balance)} />
                  </span>
                </div>
                <div className="agent-task muted">
                  {WALLET_TYPES.find((t) => t.key === w.type)?.label ?? w.type}
                  {w.description ? ` · ${w.description}` : ""}
                </div>
                {selectedId === w.id && (
                  <div className="task-actions row">
                    <button className="pill" onClick={(e) => { e.stopPropagation(); setMode("edit"); }}>✏️ Ubah</button>
                    {confirm === w.id ? (
                      <>
                        <button className="pill danger" onClick={(e) => { e.stopPropagation(); void deleteWallet(w.id); setConfirm(null); }}>Ya, hapus</button>
                        <button className="pill ghost" onClick={(e) => { e.stopPropagation(); setConfirm(null); }}>Batal</button>
                      </>
                    ) : (
                      <button className="pill ghost" onClick={(e) => { e.stopPropagation(); setConfirm(w.id); }}>🗑 Hapus</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// ── Riwayat ──────────────────────────────────────────────────────────────────

function LogPanel() {
  const snapshot = useVillage((s) => s.snapshot);
  const deleteExpense = useVillage((s) => s.deleteExpense);
  if (!snapshot) return null;
  const { start, end } = (() => {
    const s = new Date(snapshot.period.year, snapshot.period.month - 1, 1);
    const e = new Date(snapshot.period.year, snapshot.period.month, 1);
    return { start: s.getTime(), end: e.getTime() };
  })();
  type Row = { id: string; date: string; kind: "save" | "spend"; amount: number; title: string; sub?: string; expenseId?: number };
  const rows: Row[] = [];
  for (const g of snapshot.goals)
    for (const c of g.contributions) {
      const t = Date.parse(c.date);
      if (t >= start && t < end)
        rows.push({ id: `c${c.id}`, date: c.date, kind: "save", amount: c.amount, title: g.title, sub: c.note ?? undefined });
    }
  for (const e of snapshot.expenses)
    rows.push({
      id: `e${e.id}`,
      date: e.date,
      kind: "spend",
      amount: e.amount,
      title: e.category || "Pengeluaran",
      sub: [e.note, e.walletName].filter(Boolean).join(" · ") || undefined,
      expenseId: e.id
    });
  rows.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return (
    <>
      <p className="intro">{monthLabel(snapshot.period.month, snapshot.period.year)} · {rows.length} catatan</p>
      {rows.length === 0 && <p className="muted">Belum ada aktivitas bulan ini.</p>}
      <div className="log-list">
        {rows.map((r) => (
          <div key={r.id} className={`log-row ${r.kind}`}>
            <span className="muted" title={new Date(r.date).toLocaleString("id-ID")}>{shortDate(r.date)}</span>
            <span className="log-text">
              <b className={r.kind === "save" ? "save-text" : "spend-text"}>
                <Money value={r.kind === "save" ? r.amount : -r.amount} signed />
              </b>{" "}
              {r.kind === "save" ? "ke" : ""} {r.title}
              {r.sub && <span className="muted"> · {r.sub}</span>}
              <small className="muted block">{timeAgo(r.date)}</small>
            </span>
            {r.expenseId && (
              <button className="icon-btn danger small" title="Hapus pengeluaran (saldo dompet dikembalikan)" onClick={() => void deleteExpense(r.expenseId!)}>🗑</button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ── Bulan ini ────────────────────────────────────────────────────────────────

function MonthPanel() {
  const snapshot = useVillage((s) => s.snapshot);
  if (!snapshot) return null;
  const { summary } = snapshot;
  const h = summary.health;
  const cats = Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] ?? 1;
  const scoreColor = h.score >= 85 ? "#2fb57d" : h.score >= 70 ? "#5b9ae0" : h.score >= 55 ? "#e0b84a" : "#e86d6d";
  return (
    <>
      <div className="score-card">
        <div className="hall-ring big" style={{ background: `conic-gradient(${scoreColor} ${h.score}%, #f1e4ea 0)` }}>
          <span>{h.score}</span>
        </div>
        <div>
          <b>{h.status}</b>
          <small className="muted block">Skor kesehatan {monthLabel(summary.month, summary.year)}. Rumus sama dengan halaman Laporan tepira.</small>
        </div>
      </div>
      <div className="detail-grid">
        <div><small>Rasio tabungan</small><b>{summary.savingsRate}%</b></div>
        <div><small>Disiplin budget</small><b>{h.budgetDiscipline}%</b></div>
        <div><small>Runway</small><b>{h.runwayMonths} bln</b></div>
        <div><small>Skor utang</small><b>{h.debtScore}</b></div>
      </div>
      <section>
        <h3>Arus bulan ini</h3>
        <div className="log-list">
          <div className="log-row"><span className="log-text">Saldo awal</span><b><Money value={summary.startingBalance} /></b></div>
          <div className="log-row"><span className="log-text">Gaji</span><b><Money value={summary.income.salary} /></b></div>
          <div className="log-row"><span className="log-text">Bonus</span><b><Money value={summary.income.bonus} /></b></div>
          <div className="log-row save"><span className="log-text">Ditabung ke goal</span><b className="save-text"><Money value={summary.savedThisMonth} /></b></div>
          <div className="log-row"><span className="log-text">Alokasi tabungan gaji</span><b><Money value={summary.savingsAllocation} /></b></div>
          <div className="log-row spend"><span className="log-text">Pengeluaran ({summary.expenses.count}x)</span><b className="spend-text"><Money value={summary.expenses.total} /></b></div>
          <div className="log-row"><span className="log-text">Budget pengeluaran</span><b>{summary.budget.status === "NO_BUDGET" ? "—" : <Money value={summary.budget.limit} />}</b></div>
        </div>
        <p className="muted small">Alokasi gaji, bonus, dan saldo awal diatur lewat tepira.id (halaman Alokasi Gaji / Bonus / Saldo Awal).</p>
      </section>
      <section>
        <h3>Per kategori</h3>
        {cats.length === 0 && <p className="muted">Belum ada pengeluaran.</p>}
        {cats.map(([name, amount]) => (
          <div key={name} className="cat-row">
            <div className="cat-head"><span>{name}</span><b><Money value={amount} /></b></div>
            <div className="bar thin"><div style={{ width: `${Math.round((amount / maxCat) * 100)}%`, background: "#f0a06a" }} /></div>
          </div>
        ))}
      </section>
    </>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

const TITLES: Record<Exclude<ReturnType<typeof useVillage.getState>["panel"], null>, string> = {
  goals: "🎯 Goal tabungan",
  save: "🪙 Nabung teu pira",
  spend: "💸 Catat pengeluaran",
  wallets: "👛 Dompet",
  log: "📜 Riwayat",
  month: "📊 Bulan ini"
};

export default function Panels() {
  const panel = useVillage((s) => s.panel);
  const setPanel = useVillage((s) => s.setPanel);
  if (!panel) return null;
  return (
    <PanelShell title={TITLES[panel]} onClose={() => setPanel(null)}>
      {panel === "goals" && <GoalsPanel />}
      {panel === "save" && <SavePanel />}
      {panel === "spend" && <SpendPanel />}
      {panel === "wallets" && <WalletsPanel />}
      {panel === "log" && <LogPanel />}
      {panel === "month" && <MonthPanel />}
    </PanelShell>
  );
}
