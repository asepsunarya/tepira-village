"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ContributionView, ExpenseView, GoalPace, GoalView, KnownPlace, WalletView } from "@/lib/game";
import {
  MAX_VILLAGERS,
  NOSPEND_BACKFILL_DAYS,
  VILLAGER_NAMES,
  VILLAGE_UNLOCKS,
  WALLET_TYPES,
  buildStage,
  goalPace,
  previewInsight,
  walletEmoji,
  wibDayDate,
  xpForLevel
} from "@/lib/game";
import { expenseCategories, getCategoryLabel } from "@/lib/categories";
import {
  dateInputValue,
  defaultInputDateFor,
  formatRupiah,
  inputDateDaysAgo,
  inputDateLabel,
  monthLabel,
  periodWord,
  shortDate,
  timeAgo,
  todayInputValue
} from "@/lib/format";
import { parseQuickEntry, type QuickEntry } from "@/lib/quick-entry";
import { LIMIT_COLOR, LIMIT_WORD, findPlaceLimit, limitStatus, type LimitLevel } from "@/lib/place-limits";
import { normalizePlaceName, spendByPlaceName } from "@/lib/places";
import { useMoneyVisible, useVillage } from "../store";
import { useLetter, useStreak, useVillageXp } from "../useProgress";
import { Money } from "./Money";
import { AmountInput, CATEGORY_GROUPS } from "./inputs";
import SalaryPanel, { CategoryBudgetHint } from "./SalaryPanel";
import PlacePicker, { NO_PLACE, placeInput, type PlaceValue } from "./PlacePicker";
import JajanView from "./JajanView";
import { PlaceLimitHint } from "./PlaceLimit";
import { useLimitViews } from "../usePlaces";

const NO_PLACES: KnownPlace[] = [];
const NO_EXPENSES: ExpenseView[] = [];

const QUICK_AMOUNTS = [5_000, 10_000, 20_000, 50_000, 100_000, 500_000];

function CategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Kategori lama yang tidak ada di daftar (mis. diketik di tepira) tetap bisa dipilih.
  const known = expenseCategories.some((c) => c.label === value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {!known && value && <option value={value}>{value}</option>}
      {Object.entries(CATEGORY_GROUPS).map(([group, items]) => (
        <optgroup key={group} label={group}>
          {items.map((c) => (
            <option key={c.key} value={c.label}>{c.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function PanelShell({
  title,
  children,
  onClose
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <aside className="panel card" data-tour="panel">
      <header>
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose} title="Tutup">✕</button>
      </header>
      <div className="panel-body">{children}</div>
    </aside>
  );
}

// ── Goals ────────────────────────────────────────────────────────────────────

const PACE_CHIP: Partial<Record<GoalPace["status"], { text: string; tone: string }>> = {
  ontrack: { text: "sesuai jadwal", tone: "ok" },
  ahead: { text: "lebih cepat", tone: "ok" },
  behind: { text: "telat jadwal", tone: "behind" },
  overdue: { text: "lewat target", tone: "behind" }
};

function GoalRow({ goal, selected, onSelect }: { goal: GoalView; selected: boolean; onSelect: () => void }) {
  const pct = Math.round(goal.progress * 100);
  const done = goal.progress >= 1;
  const pace = goalPace(goal);
  const chip = pace.catchingUp ? { text: "mengejar jadwal", tone: "ok" } : PACE_CHIP[pace.status];
  return (
    <div className={`task-row ${selected ? "on" : ""} ${done ? "status-done" : ""}`} onClick={onSelect} role="button">
      <div className="task-main">
        <div className="task-title">
          {done ? "🏡" : "🏗️"} {goal.title} <span className="status-chip">{pct}%</span>
          {chip && <span className={`pace-chip ${chip.tone}`}>{chip.text}</span>}
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
  const [editingId, setEditingId] = useState<number | null>(null);
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
      <PaceNote goal={goal} />
      {goal.progress < 1 && <DeadlineEditor goal={goal} />}
      {goal.progress < 1 && (
        <button className="primary" onClick={() => setPanel("save")}>🪙 Nabung ke goal ini</button>
      )}

      <section>
        <h3>Riwayat setoran</h3>
        {goal.contributions.length === 0 && <p className="muted">Belum ada setoran. Mulai dari yang teu pira!</p>}
        <div className="log-list">
          {goal.contributions.map((c) =>
            editingId === c.id ? (
              <ContributionEditForm key={c.id} contribution={c} onDone={() => setEditingId(null)} />
            ) : (
              <div key={c.id} className="log-row">
                <span className="muted">{shortDate(c.date)}</span>
                <span className="log-text">
                  <b className="save-text"><Money value={c.amount} signed /></b>
                  {c.note && <span className="muted"> · {c.note}</span>}
                </span>
                <button className="icon-btn small" title="Edit setoran" onClick={() => setEditingId(c.id)}>✏️</button>
                <button className="icon-btn danger small" title="Hapus setoran" onClick={() => void deleteContribution(c.id)}>🗑</button>
              </div>
            )
          )}
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

/** "Kejar deadline": seberapa jauh dari jadwal dan berapa yang perlu disetor per minggu. */
function PaceNote({ goal }: { goal: GoalView }) {
  const pace = goalPace(goal);
  const due = goal.deadline ? shortDate(goal.deadline) : "";
  const when = pace.daysLeft === 0 ? "hari ini" : `${pace.daysLeft} hari lagi`;
  const perWeek = (
    <>
      <b><Money value={pace.perWeek} /></b>/minggu (≈ <Money value={pace.perMonth} />/bulan)
    </>
  );
  switch (pace.status) {
    case "none":
      return <p className="pace-note">🗓️ Belum ada target tanggal, jadi desa belum bisa menghitung setoran per minggu.</p>;
    case "ontrack":
      return pace.catchingUp ? (
        <p className="pace-note ok">
          👷 Sedang mengejar jadwal: setoran 4 minggu terakhir sudah cukup cepat. Target {due} ({when}): pertahankan{" "}
          {perWeek}.
        </p>
      ) : (
        <p className="pace-note ok">
          👷 Sesuai jadwal. Target {due} ({when}): setor {perWeek} supaya tepat waktu.
        </p>
      );
    case "ahead":
      return (
        <p className="pace-note ok">
          🚀 Lebih cepat dari jadwal! Target {due} ({when}) cukup dengan {perWeek}.
        </p>
      );
    case "behind":
      return (
        <p className="pace-note behind">
          🌿 Telat dari jadwal: seharusnya sudah {Math.round(pace.expected * 100)}%, sekarang {Math.round(goal.progress * 100)}%.
          Kejar dengan {perWeek} sampai {due}.
        </p>
      );
    case "overdue":
      return (
        <p className="pace-note behind">
          ⏰ Target {due} sudah lewat {-pace.daysLeft} hari. Sisa <b><Money value={pace.remaining} /></b>. Geser target
          tanggalnya, atau terus setor; bangunannya tetap naik.
        </p>
      );
    default:
      return null;
  }
}

/** Target tanggal bisa diatur/diubah di sini (tepira hanya mengisinya saat goal dibuat). */
function DeadlineEditor({ goal }: { goal: GoalView }) {
  const updateGoalDeadline = useVillage((s) => s.updateGoalDeadline);
  const loading = useVillage((s) => s.loading);
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(goal.deadline ? dateInputValue(goal.deadline) : "");
  if (!editing) {
    return (
      <button
        className="pill deadline-open"
        onClick={() => {
          setDate(goal.deadline ? dateInputValue(goal.deadline) : "");
          setEditing(true);
        }}
      >
        {goal.deadline ? "✏️ Ubah target tanggal" : "🗓️ Atur target tanggal"}
      </button>
    );
  }
  const save = async (value: string | null) => {
    if (await updateGoalDeadline(goal.id, value)) setEditing(false);
  };
  return (
    <form
      className="add-form deadline-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (date) void save(date);
      }}
    >
      <label>
        Target tanggal
        <input type="date" value={date} min={todayInputValue()} onChange={(e) => setDate(e.target.value)} autoFocus />
      </label>
      <div className="confirm-row">
        <button className="pill on" type="submit" disabled={loading || !date}>💾 Simpan</button>
        {goal.deadline && (
          <button className="pill ghost" type="button" disabled={loading} onClick={() => void save(null)}>
            Hapus target
          </button>
        )}
        <button className="pill ghost" type="button" onClick={() => setEditing(false)}>Batal</button>
      </div>
    </form>
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
    <form className="add-form" onSubmit={submit} data-tour="goal-form">
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
      <button className="primary" type="submit" data-tour="goal-submit" disabled={loading || !title.trim() || target <= 0}>
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
        <button className="primary" onClick={() => setAdding(true)} data-tour="goal-new">➕ Goal baru</button>
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
  const pace = goal ? goalPace(goal) : null;

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
        <button className="primary" onClick={() => setPanel("goals")} data-tour="save-need-goal">🎯 Buat goal</button>
      </>
    );
  }

  return (
    <form className="add-form" onSubmit={submit} data-tour="save-form">
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
      {goal && pace && (pace.status === "ontrack" || pace.status === "ahead" || pace.status === "behind") && (
        <p className="cat-hint">
          🗓️ Supaya tepat {shortDate(goal.deadline!)}: <b><Money value={pace.perWeek} />/minggu</b>{" "}
          <button type="button" className="pill" onClick={() => setAmount(pace.perWeek)}>
            Isi
          </button>
        </p>
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
      <button className="primary" type="submit" data-tour="save-submit" disabled={loading || amount <= 0 || !goalId}>
        🪙 Setor {amount > 0 ? formatRupiah(amount) : ""}
      </button>
    </form>
  );
}

// ── Catat pengeluaran ────────────────────────────────────────────────────────

function SpendPanel() {
  const wallets = useVillage((s) => s.snapshot?.wallets ?? []);
  const summary = useVillage((s) => s.snapshot?.summary);
  const viewMonth = useVillage((s) => s.snapshot?.period.month ?? new Date().getMonth() + 1);
  const viewYear = useVillage((s) => s.snapshot?.period.year ?? new Date().getFullYear());
  const salary = useVillage((s) => s.snapshot?.salary ?? null);
  const expenses = useVillage((s) => s.snapshot?.expenses);
  const spend = useVillage((s) => s.spend);
  const loading = useVillage((s) => s.loading);
  const setPanel = useVillage((s) => s.setPanel);
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState<string>(expenseCategories[0].label);
  const [walletId, setWalletId] = useState<number>(wallets[0]?.id ?? 0);
  const [source, setSource] = useState<"gaji" | "bonus">("gaji");
  // Lihat bulan lalu lalu buka Catat = biasanya mau mengisi bulan itu: tanggal default ikut bulan yang dilihat.
  const viewKey = `${viewYear}-${String(viewMonth).padStart(2, "0")}`;
  const [date, setDate] = useState(() => defaultInputDateFor(viewMonth, viewYear));
  const [dateFor, setDateFor] = useState(viewKey);
  if (dateFor !== viewKey) {
    setDateFor(viewKey);
    setDate(defaultInputDateFor(viewMonth, viewYear));
  }
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!walletId && wallets[0]) setWalletId(wallets[0].id);
  }, [walletId, wallets]);
  // Sisa budget hanya benar untuk bulan yang sedang dimuat; tanggal kosong = hari ini (aturan server).
  const dateMonth = (date || todayInputValue()).slice(0, 7);
  const sameMonth = dateMonth === viewKey;
  const hasBudget = Boolean(salary) || (summary !== undefined && summary.budget.status !== "NO_BUDGET");

  const places = useVillage((s) => s.snapshot?.places ?? NO_PLACES);
  const [place, setPlace] = useState<PlaceValue>(NO_PLACE);
  // Batas jajan tempat yang sedang diisi (hanya untuk bulan yang dimuat, seperti sisa budget).
  const placeLimits = useVillage((s) => s.placeLimits);
  const placeSpend = useMemo(() => spendByPlaceName(expenses ?? NO_EXPENSES), [expenses]);
  const placeLimit = sameMonth && place.name.trim() ? findPlaceLimit(placeLimits, place.name) : null;
  const placeSpent = placeLimit ? (placeSpend.get(normalizePlaceName(place.name))?.total ?? 0) : 0;
  const placeLevel: LimitLevel | null = placeLimit ? (limitStatus(placeSpent + amount, placeLimit.limit)?.level ?? null) : null;
  const placeHint = placeLimit && (
    <PlaceLimitHint
      name={placeLimit.name}
      spent={placeSpent}
      limit={placeLimit.limit}
      amount={amount}
      periodWord={periodWord({ month: viewMonth, year: viewYear })}
    />
  );

  // ⚡ Catat cepat: kalimat ("bakso 15rb gopay") langsung mengisi form di bawahnya.
  const moneyVisible = useMoneyVisible();
  const [quick, setQuick] = useState("");
  const [parsed, setParsed] = useState<QuickEntry | null>(null);
  const [quickHint, setQuickHint] = useState<string | null>(null);
  // Isian sebelum mulai mengetik (atau yang diubah manual sesudahnya): dipakai lagi untuk bagian
  // yang tidak disebut di kalimat, jadi menghapus "gopay" mengembalikan dompet semula.
  const base = useRef({ category, walletId, date, source, place });
  const typeQuick = (text: string) => {
    if (!quick.trim() && text.trim()) base.current = { category, walletId, date, source, place };
    setQuick(text);
    setQuickHint(null);
    if (!text.trim()) {
      setParsed(null);
      if (quick.trim()) {
        // Kalimatnya dihapus: kembalikan isian yang tadi diisi olehnya.
        setAmount(0);
        setNote("");
        setCategory(base.current.category);
        setWalletId(base.current.walletId);
        setDate(base.current.date);
        setSource(base.current.source);
        setPlace(base.current.place);
      }
      return;
    }
    const p = parseQuickEntry(text, wallets, new Date(), places);
    setParsed(p);
    setAmount(p.amount ?? 0);
    setCategory(p.categoryKey ? getCategoryLabel(p.categoryKey) : base.current.category);
    setWalletId(p.walletId ?? base.current.walletId);
    setDate(p.daysAgo !== null ? inputDateDaysAgo(p.daysAgo) : base.current.date);
    setSource(p.source ?? base.current.source);
    setPlace(p.place ? { ...p.place, from: p.place.lat !== null ? "known" : undefined } : base.current.place);
    setNote(p.note);
  };
  const pickPlace = (v: PlaceValue) => {
    setPlace(v);
    base.current.place = v;
  };
  const pickCategory = (v: string) => {
    setCategory(v);
    base.current.category = v;
  };
  const pickWallet = (v: number) => {
    setWalletId(v);
    base.current.walletId = v;
  };
  const pickSource = (v: "gaji" | "bonus") => {
    setSource(v);
    base.current.source = v;
  };
  const pickDate = (v: string) => {
    setDate(v);
    base.current.date = v;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (amount <= 0 || !walletId) return;
    const fromQuick = Boolean(quick.trim());
    const ok = await spend({ amount, category, note, source, date, walletId, place: placeInput(place) });
    if (ok) {
      setAmount(0);
      setNote("");
      setQuick("");
      setParsed(null);
      // Tempat tidak terbawa ke catatan berikutnya: lebih aman daripada titik yang salah di peta.
      setPlace(NO_PLACE);
      if (fromQuick) {
        // Tiap kalimat menyebut tanggalnya sendiri; yang berikutnya mulai dari tanggal bawaan lagi.
        // Dompet & kategori tetap seperti form biasa.
        setDate(defaultInputDateFor(viewMonth, viewYear));
        setSource("gaji");
      }
    }
  };

  if (wallets.length === 0) {
    return (
      <>
        <p className="muted">Pengeluaran harus dipotong dari dompet. Buat dompet dulu, ya.</p>
        <button className="primary" onClick={() => setPanel("wallets")} data-tour="spend-need-wallet">👛 Buat dompet</button>
        <NoSpendToday />
      </>
    );
  }

  return (
    <>
      <form className="add-form" onSubmit={submit} data-tour="spend-form">
        {/* Ikut mode sembunyikan angka: nominal yang diketik ikut terlihat, jadi kolomnya ditutup juga. */}
        {moneyVisible && (
          <div className="quick-entry">
            <label>
              ⚡ Catat cepat
              <input
                value={quick}
                onChange={(e) => typeQuick(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || (amount > 0 && walletId)) return;
                  e.preventDefault();
                  setQuickHint(amount > 0 ? "Pilih dompetnya dulu." : "Nominalnya belum terbaca. Tulis misalnya 15rb atau 15.000.");
                }}
                placeholder="kopi 20rb gopay · kemarin parkir 2rb"
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="send"
                aria-describedby="quick-preview"
              />
            </label>
            {parsed && (
              <QuickPreview
                parsed={parsed}
                amount={amount}
                category={category}
                wallet={wallets.find((w) => w.id === walletId)}
                date={date}
                source={source}
                place={place}
                limitLevel={placeLevel}
              />
            )}
            {parsed?.place && placeHint}
            {quickHint && <p className="cat-hint warn">{quickHint}</p>}
            {!quick && <small className="muted">Ketik seperti chat lalu Enter. Isian di bawah ikut terisi dan masih bisa diubah.</small>}
          </div>
        )}
        {sameMonth && summary && summary.budget.status !== "NO_BUDGET" && (
          <p className={`intro ${summary.budget.status === "OVER_BUDGET" ? "warn" : ""}`}>
            Sisa budget bulan ini: <b><Money value={summary.budget.remaining} /></b>
          </p>
        )}
        <label>
          Nominal
          <AmountInput value={amount} onChange={setAmount} placeholder="25.000" />
        </label>
        <label>
          Kategori
          <CategorySelect value={category} onChange={pickCategory} />
        </label>
        {sameMonth && salary && source === "gaji" && (
          <CategoryBudgetHint salary={salary} expenses={expenses ?? []} category={category} amount={amount} />
        )}
        {!sameMonth && hasBudget && /^\d{4}-\d{2}$/.test(dateMonth) && (
          <p className="cat-hint">
            Jatah {monthLabel(Number(dateMonth.slice(5, 7)), Number(dateMonth.slice(0, 4)))} tidak dimuat. Pindah ke bulan itu
            untuk melihat sisa budget.
          </p>
        )}
        <label>
          Dompet
          <select value={walletId} onChange={(e) => pickWallet(Number(e.target.value))}>
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
            <select value={source} onChange={(e) => pickSource(e.target.value as "gaji" | "bonus")}>
              <option value="gaji">Gaji</option>
              <option value="bonus">Bonus</option>
            </select>
          </label>
          <label>
            Tanggal
            <input type="date" value={date} onChange={(e) => pickDate(e.target.value)} />
          </label>
        </div>
        <label>
          Catatan (opsional)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Makan siang" />
        </label>
        <PlacePicker value={place} onChange={pickPlace} places={places} />
        {!parsed?.place && placeHint}
        <button className="primary spend" type="submit" data-tour="spend-submit" disabled={loading || amount <= 0 || !walletId}>
          💸 Catat {amount > 0 ? formatRupiah(amount) : ""}
        </button>
      </form>
      <NoSpendToday />
    </>
  );
}

/** Hasil baca catat cepat: yang terbaca dari kalimat ditebalkan, sisanya masih isian form. */
function QuickPreview({
  parsed,
  amount,
  category,
  wallet,
  date,
  source,
  place,
  limitLevel = null
}: {
  parsed: QuickEntry;
  amount: number;
  category: string;
  wallet: WalletView | undefined;
  date: string;
  source: "gaji" | "bonus";
  place: PlaceValue;
  /** level batas jajan tempat ini kalau nominal yang diketik ikut dihitung */
  limitLevel?: LimitLevel | null;
}) {
  const limitClass = limitLevel === "warn" || limitLevel === "over" ? limitLevel : "";
  return (
    <div className="quick-preview" id="quick-preview" aria-live="polite">
      <span className={`qchip ${parsed.amount ? "found" : "missing"}`}>{parsed.amount ? formatRupiah(amount) : "nominal?"}</span>
      {/* "Langganan (Spotify, Netflix, dll)" → "Langganan" */}
      <span className={`qchip ${parsed.categoryKey ? "found" : ""}`}>{category.replace(/\s*\(.*\)$/, "")}</span>
      <span className={`qchip ${parsed.walletId ? "found" : ""}`}>
        {wallet ? `${walletEmoji(wallet.type)} ${wallet.name}` : "dompet?"}
      </span>
      <span className={`qchip ${parsed.daysAgo !== null ? "found" : ""}`}>{inputDateLabel(date)}</span>
      {source === "bonus" && <span className={`qchip ${parsed.source ? "found" : ""}`}>dari bonus</span>}
      {place.name && (
        <span className={`qchip ${parsed.place ? "found" : ""} ${limitClass}`}>
          📍 {place.name}
          {place.lat === null ? " · tanpa titik" : ""}
          {limitClass ? ` · ${LIMIT_WORD[limitClass]}` : ""}
        </span>
      )}
      {parsed.assumedThousands && <small className="muted">angka kecil dianggap ribuan</small>}
    </div>
  );
}

/** Hari tanpa belanja tetap menyalakan lampu streak, asal ditandai. */
function NoSpendToday() {
  const streak = useStreak();
  const toggleNoSpend = useVillage((s) => s.toggleNoSpend);
  const today = streak.week[6];
  if (today.recorded) return null;
  return (
    <div className={`nospend-box ${today.noSpend ? "on" : ""}`}>
      {today.noSpend ? (
        <>
          🌙 Hari ini ditandai <b>nol pengeluaran</b>.
          <button className="link-btn" onClick={() => toggleNoSpend(today.day)}>Batalkan</button>
        </>
      ) : (
        <>
          <span>Hari ini tidak belanja apa-apa?</span>
          <button className="pill" onClick={() => toggleNoSpend(today.day)}>🌙 Tandai nol pengeluaran</button>
        </>
      )}
    </div>
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
    <form className="add-form" onSubmit={submit} data-tour={wallet ? "wallet-edit-form" : "wallet-form"}>
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
      <button className="primary" type="submit" data-tour={wallet ? undefined : "wallet-submit"} disabled={loading || !name.trim()}>
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
      <button className="primary" onClick={() => setMode("add")} data-tour="wallet-new">➕ Dompet baru</button>
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

// ── Edit riwayat ─────────────────────────────────────────────────────────────

function ContributionEditForm({ contribution, onDone }: { contribution: ContributionView; onDone: () => void }) {
  const updateContribution = useVillage((s) => s.updateContribution);
  const loading = useVillage((s) => s.loading);
  const originalDate = dateInputValue(contribution.date);
  const [amount, setAmount] = useState(contribution.amount);
  const [date, setDate] = useState(originalDate);
  const [note, setNote] = useState(contribution.note ?? "");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (amount <= 0) return;
    // Tanggal hanya dikirim kalau diubah, supaya jam aslinya tidak hilang.
    const ok = await updateContribution(contribution.id, {
      amount,
      note,
      date: date !== originalDate ? date : undefined
    });
    if (ok) onDone();
  };
  return (
    <form className="add-form log-edit save" onSubmit={submit}>
      <label>
        Nominal
        <AmountInput value={amount} onChange={setAmount} autoFocus />
      </label>
      <div className="two-col">
        <label>
          Tanggal
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Catatan
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="opsional" />
        </label>
      </div>
      <div className="confirm-row">
        <button className="pill on" type="submit" disabled={loading || amount <= 0}>💾 Simpan</button>
        <button className="pill ghost" type="button" onClick={onDone}>Batal</button>
      </div>
    </form>
  );
}

function ExpenseEditForm({ expense, onDone }: { expense: ExpenseView; onDone: () => void }) {
  const wallets = useVillage((s) => s.snapshot?.wallets ?? []);
  const updateExpense = useVillage((s) => s.updateExpense);
  const loading = useVillage((s) => s.loading);
  const originalDate = dateInputValue(expense.date);
  const [amount, setAmount] = useState(expense.amount);
  const [category, setCategory] = useState(expense.category ?? expenseCategories[0].label);
  const [walletId, setWalletId] = useState<number>(expense.walletId ?? wallets[0]?.id ?? 0);
  const [source, setSource] = useState<"gaji" | "bonus">(expense.source === "bonus" ? "bonus" : "gaji");
  const [date, setDate] = useState(originalDate);
  const [note, setNote] = useState(expense.note ?? "");
  const places = useVillage((s) => s.snapshot?.places ?? NO_PLACES);
  const [place, setPlace] = useState<PlaceValue>({
    name: expense.placeName ?? "",
    lat: expense.latitude,
    lng: expense.longitude,
    // Titik lama tetap kalau cuma namanya yang diperbaiki.
    from: expense.latitude !== null ? "gps" : undefined
  });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (amount <= 0 || !walletId) return;
    const ok = await updateExpense(expense.id, {
      amount,
      category,
      note,
      source,
      date: date !== originalDate ? date : undefined,
      walletId,
      place: placeInput(place)
    });
    if (ok) onDone();
  };
  return (
    <form className="add-form log-edit spend" onSubmit={submit}>
      <label>
        Nominal
        <AmountInput value={amount} onChange={setAmount} autoFocus />
      </label>
      <div className="two-col">
        <label>
          Kategori
          <CategorySelect value={category} onChange={setCategory} />
        </label>
        <label>
          Dompet
          <select value={walletId} onChange={(e) => setWalletId(Number(e.target.value))}>
            {!expense.walletId && <option value={0}>— pilih dompet —</option>}
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {walletEmoji(w.type)} {w.name}
              </option>
            ))}
          </select>
        </label>
      </div>
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
        Catatan
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="opsional" />
      </label>
      <PlacePicker value={place} onChange={setPlace} places={places} />
      {walletId !== expense.walletId && (
        <small className="muted">Saldo dikembalikan ke dompet lama lalu dipotong dari dompet baru.</small>
      )}
      <div className="confirm-row">
        <button className="pill on" type="submit" disabled={loading || amount <= 0 || !walletId}>💾 Simpan</button>
        <button className="pill ghost" type="button" onClick={onDone}>Batal</button>
      </div>
    </form>
  );
}

// ── Riwayat ──────────────────────────────────────────────────────────────────

function LogPanel() {
  const snapshot = useVillage((s) => s.snapshot);
  const deleteExpense = useVillage((s) => s.deleteExpense);
  const [editing, setEditing] = useState<string | null>(null);
  if (!snapshot) return null;
  const { start, end } = (() => {
    const s = new Date(snapshot.period.year, snapshot.period.month - 1, 1);
    const e = new Date(snapshot.period.year, snapshot.period.month, 1);
    return { start: s.getTime(), end: e.getTime() };
  })();
  type Row = {
    id: string;
    date: string;
    kind: "save" | "spend";
    amount: number;
    title: string;
    sub?: string;
    contribution?: ContributionView;
    expense?: ExpenseView;
  };
  const rows: Row[] = [];
  for (const g of snapshot.goals)
    for (const c of g.contributions) {
      const t = Date.parse(c.date);
      if (t >= start && t < end)
        rows.push({ id: `c${c.id}`, date: c.date, kind: "save", amount: c.amount, title: g.title, sub: c.note ?? undefined, contribution: c });
    }
  for (const e of snapshot.expenses)
    rows.push({
      id: `e${e.id}`,
      date: e.date,
      kind: "spend",
      amount: e.amount,
      title: e.category || "Pengeluaran",
      sub: [e.note, e.walletName, e.placeName && `📍 ${e.placeName}`].filter(Boolean).join(" · ") || undefined,
      expense: e
    });
  rows.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const done = () => setEditing(null);
  return (
    <>
      <p className="intro">{monthLabel(snapshot.period.month, snapshot.period.year)} · {rows.length} catatan</p>
      {rows.length === 0 && <p className="muted">Belum ada aktivitas bulan ini.</p>}
      <div className="log-list">
        {rows.map((r) =>
          editing === r.id ? (
            r.contribution ? (
              <ContributionEditForm key={r.id} contribution={r.contribution} onDone={done} />
            ) : (
              <ExpenseEditForm key={r.id} expense={r.expense!} onDone={done} />
            )
          ) : (
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
              <button className="icon-btn small" title="Edit" onClick={() => setEditing(r.id)}>✏️</button>
              {r.expense && (
                <button className="icon-btn danger small" title="Hapus pengeluaran (saldo dompet dikembalikan)" onClick={() => void deleteExpense(r.expense!.id)}>🗑</button>
              )}
            </div>
          )
        )}
      </div>
    </>
  );
}

// ── Bulan ini ────────────────────────────────────────────────────────────────

function MonthPanel() {
  const snapshot = useVillage((s) => s.snapshot);
  const setPanel = useVillage((s) => s.setPanel);
  const openJajan = useVillage((s) => s.openJajan);
  const limitViews = useLimitViews();
  const moneyVisible = useMoneyVisible();
  if (!snapshot) return null;
  const { summary } = snapshot;
  const h = summary.health;
  const cats = Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] ?? 1;
  const scoreColor = h.score >= 85 ? "#2fb57d" : h.score >= 70 ? "#5b9ae0" : h.score >= 55 ? "#e0b84a" : "#e86d6d";
  return (
    <>
      <div className="score-card" data-tour="month-score">
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
        <div className="chips">
          <button className="pill salary-open" onClick={() => setPanel("salary")}>
            💰 Atur alokasi gaji
          </button>
          <button className="pill" onClick={() => setPanel("jajan")}>
            🗺️ Peta jajan
          </button>
        </div>
        <p className="muted small">Bonus dan saldo awal masih diatur lewat tepira.id (halaman Bonus / Saldo Awal).</p>
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
      <section>
        <h3>🎯 Batas jajan per tempat</h3>
        {limitViews.size === 0 && (
          <p className="muted small">Belum ada batas. Pilih tempat di 🗺️ Peta jajan (atau klik kiosnya di pulau), lalu 🎯 Atur batas jajan.</p>
        )}
        {[...limitViews.values()]
          .sort((a, b) => b.ratio - a.ratio)
          .map((l) => (
            <button key={l.name} className={`cat-row limit-row ${l.level}`} onClick={() => openJajan(l.name)} title="Lihat di peta jajan">
              <div className="cat-head">
                <span>{l.name} <small className={`cat-hint ${l.level}`}>{LIMIT_WORD[l.level]}</small></span>
                <b><Money value={l.spent} /> / <Money value={l.limit} /></b>
              </div>
              {moneyVisible && (
                <div className="bar thin">
                  <div style={{ width: `${Math.min(100, Math.round(l.ratio * 100))}%`, background: LIMIT_COLOR[l.level] }} />
                </div>
              )}
            </button>
          ))}
      </section>
    </>
  );
}

// ── Perkembangan desa: streak, warga, bangunan level ─────────────────────────

const weekday = (day: number) => wibDayDate(day).toLocaleDateString("id-ID", { weekday: "short", timeZone: "UTC" });

function VillagePanel() {
  const streak = useStreak();
  const { xp, level } = useVillageXp();
  const toggleNoSpend = useVillage((s) => s.toggleNoSpend);
  const setPanel = useVillage((s) => s.setPanel);
  const moneyVisible = useMoneyVisible();
  return (
    <>
      <div className="streak-card">
        <div className="streak-big">
          <span>{streak.current > 0 ? "🔥" : "🕯️"}</span>
          <b>{streak.current}</b>
          <span>hari beruntun</span>
        </div>
        <small className="muted">Terpanjang {streak.longest} hari</small>
      </div>
      <p className={`intro ${streak.todayDone ? "" : "warn"}`}>
        {streak.todayDone
          ? "Hari ini sudah tercatat ✓ Lampu di depan Balai Desa menyala."
          : "Hari ini belum tercatat. Catat pengeluaran atau setoran, atau tandai nol pengeluaran kalau memang tidak belanja."}
      </p>
      <div className="week-strip">
        {streak.week.map((d, i) => {
          const lit = d.recorded || d.noSpend;
          return (
            <div key={d.day} className={`week-day ${lit ? "lit" : ""} ${i === 6 ? "today" : ""}`}>
              <i className="week-lamp" />
              <small>{i === 6 ? "Hari ini" : weekday(d.day)}</small>
              <b>{wibDayDate(d.day).getUTCDate()}</b>
              {d.recorded ? (
                <em>tercatat</em>
              ) : d.noSpend || d.day >= streak.today - NOSPEND_BACKFILL_DAYS ? (
                <button
                  className={`week-nospend ${d.noSpend ? "on" : ""}`}
                  onClick={() => toggleNoSpend(d.day)}
                  title={d.noSpend ? "Batalkan tanda nol pengeluaran" : "Tandai: tidak ada pengeluaran hari itu"}
                >
                  {d.noSpend ? "nol ✓" : "nol?"}
                </button>
              ) : (
                <em className="missed">–</em>
              )}
            </div>
          );
        })}
      </div>
      <p className="muted small">
        Hari tercatat = ada pengeluaran atau setoran bertanggal hari itu (WIB). Lupa kemarin? Catat dengan tanggal kemarin,
        lampunya tetap menyala. Tanda &quot;nol&quot; bisa untuk hari ini dan {NOSPEND_BACKFILL_DAYS} hari sebelumnya, tersimpan di
        perangkat ini.
      </p>
      <div className="chips">
        <button className="pill" onClick={() => setPanel("spend")}>💸 Catat pengeluaran</button>
        <button className="pill" onClick={() => setPanel("save")}>🪙 Nabung</button>
      </div>

      <section>
        <h3>
          🧑‍🌾 Warga <span className="count">{streak.villagers}/{MAX_VILLAGERS}</span>
        </h3>
        <p className="muted small">Tiap 7 hari beruntun, satu warga pindah ke desa dan menetap walaupun streak-nya putus.</p>
        <div className="chips">
          {VILLAGER_NAMES.map((name, i) => (
            <span key={name} className={`pill folk ${i < streak.villagers ? "on" : "off"}`}>
              {i < streak.villagers ? `🧑‍🌾 ${name}` : "🏚️ ?"}
            </span>
          ))}
        </div>
        {streak.nextVillagerIn > 0 && (
          <p className="intro">
            {VILLAGER_NAMES[streak.villagers]} datang kalau streak bertambah <b>{streak.nextVillagerIn} hari</b> lagi.
          </p>
        )}
      </section>

      <section>
        <h3>
          🏗️ Bangunan level <span className="count">Lv{level}</span>
        </h3>
        <div className="unlock-list">
          {VILLAGE_UNLOCKS.map((u) => {
            const open = level >= u.level;
            return (
              <div key={u.key} className={`unlock-row ${open ? "open" : ""}`}>
                <span className="unlock-emoji">{u.emoji}</span>
                <div className="unlock-main">
                  <b>{u.name}</b> <span className="lv">Lv{u.level}</span>
                  <small className="muted block">
                    {open
                      ? u.desc
                      : // XP bisa dihitung balik jadi total tabungan, jadi ikut disembunyikan.
                        moneyVisible
                        ? `Butuh ${(xpForLevel(u.level) - xp).toLocaleString("id-ID")} XP lagi`
                        : "Terkunci"}
                  </small>
                </div>
                <span className="unlock-state">{open ? "✓" : "🔒"}</span>
              </div>
            );
          })}
        </div>
        <p className="muted small">XP dari menabung: tiap Rp10.000 = 1 XP, tiap setoran +5 XP.</p>
      </section>
    </>
  );
}

// ── Surat mingguan ───────────────────────────────────────────────────────────

const wibShortDate = (time: number) =>
  new Date(time).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });

function LetterPanel() {
  const snapshot = useVillage((s) => s.snapshot);
  const markLetterRead = useVillage((s) => s.markLetterRead);
  const { key, unread, insight } = useLetter();
  useEffect(() => {
    if (unread) markLetterRead(key);
  }, [unread, key, markLetterRead]);
  if (!snapshot) return null;

  const { summary } = snapshot;
  const letter = insight ?? previewInsight(summary, snapshot.totals.debts);
  const score = insight?.healthScore ?? summary.health.score;
  const status = insight?.status ?? summary.health.status;
  const tone = score >= 85 ? "great" : score >= 70 ? "good" : score >= 55 ? "ok" : "bad";
  const name = snapshot.user.name?.split(" ")[0] || "kamu";
  // weekEnd = Senin berikutnya 00:00 WIB (eksklusif), jadi tampilkan Minggu-nya.
  const when = insight
    ? `Minggu ${wibShortDate(Date.parse(insight.weekStart))} – ${wibShortDate(Date.parse(insight.weekEnd) - 1)}`
    : `Pratinjau ${monthLabel(summary.month, summary.year)}`;
  return (
    <>
      <article className="letter">
        <header className="letter-head">
          <span className="letter-stamp">💌</span>
          <div>
            <b>Untuk {name}</b>
            <small className="muted block">{when}</small>
          </div>
          <span className={`letter-score ${tone}`} title={status}>
            {score}
          </span>
        </header>
        <p className="letter-body">{letter.summary}</p>
        <ul className="letter-recs">
          {letter.recommendations.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        <p className="letter-sign">— Cyrene &lt;3</p>
      </article>
      <p className="muted small">
        {insight
          ? "Surat dibuat otomatis tiap Senin 08:00 WIB oleh tepira, sama dengan Insight dari Cyrene di halaman Laporan."
          : "Belum ada insight mingguan tersimpan untuk akun ini, jadi ini pratinjau dari angka bulan yang sedang dilihat (sama seperti halaman Laporan tepira)."}
      </p>
    </>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

const TITLES: Record<Exclude<ReturnType<typeof useVillage.getState>["panel"], null>, string> = {
  goals: "🎯 Goal tabungan",
  save: "🪙 Nabung teu pira",
  spend: "💸 Catat pengeluaran",
  wallets: "👛 Dompet",
  salary: "💰 Alokasi gaji",
  log: "📜 Riwayat",
  month: "📊 Bulan ini",
  village: "🏝️ Perkembangan desa",
  letter: "💌 Surat dari Cyrene",
  jajan: "🗺️ Peta jajan"
};

export default function Panels() {
  const panel = useVillage((s) => s.panel);
  const setPanel = useVillage((s) => s.setPanel);
  if (!panel) return null;
  // Peta jajan tampil layar penuh, bukan panel samping.
  if (panel === "jajan") return <JajanView onClose={() => setPanel(null)} />;
  return (
    <PanelShell title={TITLES[panel]} onClose={() => setPanel(null)}>
      {panel === "goals" && <GoalsPanel />}
      {panel === "save" && <SavePanel />}
      {panel === "spend" && <SpendPanel />}
      {panel === "wallets" && <WalletsPanel />}
      {panel === "salary" && <SalaryPanel />}
      {panel === "log" && <LogPanel />}
      {panel === "month" && <MonthPanel />}
      {panel === "village" && <VillagePanel />}
      {panel === "letter" && <LetterPanel />}
    </PanelShell>
  );
}
