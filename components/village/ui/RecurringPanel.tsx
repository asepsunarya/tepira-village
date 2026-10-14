"use client";

import { useMemo, useState, type FormEvent } from "react";
import { expenseCategories } from "@/lib/categories";
import { walletEmoji } from "@/lib/game";
import { categoryIcon } from "@/lib/places";
import { wibDayOf } from "@/lib/season";
import {
  FREQUENCY_PRESETS,
  MAX_BILLS_PER_RULE,
  MAX_OCCURRENCES,
  MAX_SETTLE_BATCH,
  MAX_TITLE,
  alignStart,
  blockReason,
  dayInput,
  dayLabel,
  dayShort,
  dueLabel,
  formDayOfMonth,
  frequencyLabel,
  inputDay,
  installmentLabel,
  monthlyEquivalent,
  nextAfter,
  occurrencesInRange,
  presetKey,
  ruleStatus,
  scheduleLabel,
  upcomingDues,
  type BillDecision,
  type BillItem,
  type BlockReason,
  type Frequency,
  type RecurringInput,
  type RecurringKind,
  type RecurringView
} from "@/lib/recurring";
import { useMoneyVisible, useVillage, type RecurringDraft } from "../store";
import { useBillContext, useBills, useWibToday } from "../useProgress";
import { Money } from "./Money";
import { AmountInput, CategorySelect } from "./inputs";
import PlacePicker, { NO_PLACE, placeInput, type PlaceValue } from "./PlacePicker";

/**
 * 🔁 Tagihan & setoran rutin ("Pak Pos"): daftar aturan + form, dan tagihan di kotak pos. Semua
 * nominal lewat <Money/> / AmountInput (ikut mode sembunyikan angka); label jadwal tanpa nominal.
 */

const NO_RULES: RecurringView[] = [];
const LANGGANAN = expenseCategories.find((c) => c.key === "langganan")!.label;

const BLOCK_TEXT: Record<BlockReason, string> = {
  "no-wallet": "⚠️ Dompetnya sudah dihapus, pilih dompet lain",
  "no-goal": "⚠️ Goal tujuannya sudah tidak ada",
  "goal-done": "🎉 Goal-nya sudah tercapai"
};

const ruleIcon = (r: Pick<RecurringView, "kind" | "category">) => (r.kind === "saving" ? "🏗️" : categoryIcon(r.category));

function useRules() {
  return useVillage((s) => (s.snapshot?.recurring.available ? s.snapshot.recurring.rules : NO_RULES));
}

// ── Panel 🔁 ─────────────────────────────────────────────────────────────────

export default function RecurringPanel() {
  const available = useVillage((s) => s.snapshot?.recurring.available ?? false);
  const rules = useRules();
  const draft = useVillage((s) => s.recurringDraft);
  const openRecurring = useVillage((s) => s.openRecurring);
  const setPanel = useVillage((s) => s.setPanel);
  const bills = useBills();
  const today = useWibToday();

  if (!available) {
    return (
      <p className="intro warn">
        🔁 Tagihan rutin belum siap di server (tabel database-nya belum dibuat). Datamu aman, coba lagi nanti, ya.
      </p>
    );
  }

  if (draft) {
    const editing = draft.id ? rules.find((r) => r.id === draft.id) : undefined;
    return (
      <>
        <button className="link-btn" onClick={() => openRecurring(null)}>← Semua rutin</button>
        {draft.id && !editing ? (
          <p className="muted">Tagihan rutin ini sudah dihapus.</p>
        ) : (
          <RecurringForm key={draft.id ?? `new-${draft.kind ?? "expense"}`} draft={draft} editing={editing} />
        )}
      </>
    );
  }

  const active = rules.filter((r) => ruleStatus(r) === "active");
  const perMonth = (kind: RecurringKind) =>
    active.filter((r) => r.kind === kind).reduce((sum, r) => sum + monthlyEquivalent(r.amount, r), 0);
  const expenses = active.filter((r) => r.kind === "expense");
  const savings = active.filter((r) => r.kind === "saving");
  const idle = rules.filter((r) => ruleStatus(r) !== "active");
  return (
    <>
      <p className="intro">
        Pak Pos mengantar tagihan ke kotak pos saat jatuh tempo. Yang ⚡ otomatis langsung tercatat; sisanya kamu tekan
        Catat atau Lewati.
      </p>
      {active.length > 0 && (
        <p className="muted small rutin-total">
          ≈ <Money value={perMonth("expense")} />/bulan untuk tagihan · <Money value={perMonth("saving")} />/bulan untuk tabungan
        </p>
      )}
      <div className="chips">
        <button className="primary spend" onClick={() => openRecurring({ kind: "expense" })}>➕ Tagihan rutin</button>
        <button className="primary" onClick={() => openRecurring({ kind: "saving" })}>➕ Setoran rutin</button>
      </div>
      {bills.length > 0 && (
        <button className="pill mail-pill bill" onClick={() => setPanel("letter")}>
          📮 {bills.length} tagihan menunggu di kotak pos
        </button>
      )}
      <section>
        <h3>💸 Pengeluaran rutin <span className="count">{expenses.length}</span></h3>
        {expenses.length === 0 && <p className="muted small">Langganan, kos, cicilan, iuran: catat sekali, Pak Pos yang ingat.</p>}
        {expenses.map((r) => <RuleRow key={r.id} rule={r} today={today} />)}
      </section>
      <section>
        <h3>🪙 Setoran rutin <span className="count">{savings.length}</span></h3>
        {savings.length === 0 && <p className="muted small">Nabung rutin ke goal, misalnya tiap gajian atau tiap Senin.</p>}
        {savings.map((r) => <RuleRow key={r.id} rule={r} today={today} />)}
      </section>
      {idle.length > 0 && (
        <section>
          <h3>⏸️ Dijeda / selesai <span className="count">{idle.length}</span></h3>
          {idle.map((r) => <RuleRow key={r.id} rule={r} today={today} />)}
        </section>
      )}
    </>
  );
}

function RuleRow({ rule, today }: { rule: RecurringView; today: number }) {
  const openRecurring = useVillage((s) => s.openRecurring);
  const setRecurringActive = useVillage((s) => s.setRecurringActive);
  const deleteRecurring = useVillage((s) => s.deleteRecurring);
  const loading = useVillage((s) => s.loading);
  const ctx = useBillContext();
  const [confirm, setConfirm] = useState(false);
  const status = ruleStatus(rule);
  const blocked = status === "ended" ? null : blockReason(rule, ctx);
  const target = rule.kind === "saving" ? `🏗️ ${rule.goalTitle ?? "goal"}` : rule.walletName ? `👛 ${rule.walletName}` : null;
  const installment = rule.maxOccurrences !== null ? `cicilan ${Math.min(rule.occurrenceCount, rule.maxOccurrences)}/${rule.maxOccurrences}` : null;
  return (
    <div className={`rutin-row ${status}`} data-rule={rule.id}>
      <span className="rutin-icon">{ruleIcon(rule)}</span>
      <div className="rutin-main">
        <div className="rutin-head">
          <b>{rule.title}</b>
          <Money value={rule.amount} />
        </div>
        <small className="muted block">
          {scheduleLabel(rule)} · {rule.mode === "auto" ? "⚡ otomatis" : "📮 lewat kotak pos"}
          {target ? ` · ${target}` : ""}
          {installment ? ` · ${installment}` : ""}
        </small>
        {status === "active" && (
          <small className="block rutin-next">
            Berikutnya: {dayLabel(rule.nextDueDay)} ({dueLabel(rule.nextDueDay, today)})
          </small>
        )}
        {status === "paused" && <small className="block rutin-next">⏸️ Dijeda: tidak ada tagihan baru</small>}
        {status === "ended" && <small className="block rutin-next">✓ Selesai{rule.maxOccurrences ? " (lunas)" : ""}</small>}
        {blocked && <span className={`pace-chip ${blocked === "goal-done" ? "ok" : "behind"}`}>{BLOCK_TEXT[blocked]}</span>}
        <div className="task-actions row">
          <button className="pill" onClick={() => openRecurring({ id: rule.id })}>✏️ Ubah</button>
          {status === "active" && (
            <button className="pill" disabled={loading} onClick={() => void setRecurringActive(rule.id, false)}>⏸️ Jeda</button>
          )}
          {status === "paused" && (
            <button className="pill" disabled={loading} onClick={() => void setRecurringActive(rule.id, true)}>▶️ Lanjutkan</button>
          )}
          {confirm ? (
            <span className="confirm-row">
              <span>Hapus? Catatan yang sudah tercatat tetap ada.</span>
              <button className="pill danger" disabled={loading} onClick={() => void deleteRecurring(rule.id)}>Ya, hapus</button>
              <button className="pill ghost" onClick={() => setConfirm(false)}>Batal</button>
            </span>
          ) : (
            <button className="pill ghost" onClick={() => setConfirm(true)}>🗑 Hapus</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Form ─────────────────────────────────────────────────────────────────────

function RecurringForm({ draft, editing }: { draft: RecurringDraft; editing?: RecurringView }) {
  const wallets = useVillage((s) => s.snapshot?.wallets ?? []);
  const goals = useVillage((s) => s.snapshot?.goals ?? []);
  const places = useVillage((s) => s.snapshot?.places ?? []);
  const loading = useVillage((s) => s.loading);
  const saveRecurring = useVillage((s) => s.saveRecurring);
  const setPanel = useVillage((s) => s.setPanel);
  const today = useWibToday();

  const kind: RecurringKind = editing?.kind ?? draft.kind ?? "expense";
  const [title, setTitle] = useState(editing?.title ?? draft.title ?? "");
  const [amount, setAmount] = useState(editing?.amount ?? draft.amount ?? 0);
  const [category, setCategory] = useState(editing?.category ?? draft.category ?? LANGGANAN);
  const [walletId, setWalletId] = useState<number>(editing?.walletId ?? draft.walletId ?? wallets[0]?.id ?? 0);
  const [source, setSource] = useState<"gaji" | "bonus">(editing?.source ?? (draft.source === "bonus" ? "bonus" : "gaji"));
  const goalChoices = goals.filter((g) => g.progress < 1 || g.id === (editing?.goalId ?? draft.goalId));
  const [goalId, setGoalId] = useState<number>(editing?.goalId ?? draft.goalId ?? goalChoices[0]?.id ?? 0);
  const [preset, setPreset] = useState(presetKey(editing?.frequency ?? draft.frequency ?? "monthly", editing?.every ?? draft.every ?? 1));
  const firstDay = Math.max(today, editing ? editing.nextDueDay : (inputDay(draft.firstDue) ?? today));
  const [date, setDate] = useState(dayInput(firstDay));
  const [endOfMonth, setEndOfMonth] = useState((editing?.dayOfMonth ?? draft.dayOfMonth ?? 0) >= 31);
  /**
   * Patokan tanggal dari draft / aturan yang diubah (mis. 30): dipertahankan selama tanggalnya belum
   * dipilih sendiri, walau jatuh tempo pertamanya dijepit ke 28 Feb (lihat formDayOfMonth).
   */
  const [anchor, setAnchor] = useState<number | null>(editing?.dayOfMonth ?? draft.dayOfMonth ?? null);
  const [mode, setMode] = useState<"auto" | "confirm">(editing?.mode ?? draft.mode ?? "confirm");
  const [maxText, setMaxText] = useState(String(editing?.maxOccurrences ?? draft.maxOccurrences ?? ""));
  const [paidText, setPaidText] = useState("");
  const [note, setNote] = useState(editing?.note ?? draft.note ?? "");
  const initialPlace: PlaceValue = editing
    ? { name: editing.placeName ?? "", lat: editing.latitude, lng: editing.longitude, from: editing.latitude !== null ? "gps" : undefined }
    : draft.place
      ? { name: draft.place.name ?? "", lat: draft.place.lat ?? null, lng: draft.place.lng ?? null, from: draft.place.lat != null ? "known" : undefined }
      : NO_PLACE;
  const [place, setPlace] = useState<PlaceValue>(initialPlace);
  const [showPlace, setShowPlace] = useState(Boolean(initialPlace.name || initialPlace.lat !== null));
  /** Jadwal disentuh? Kalau tidak, jadwal lama dikirim apa adanya (tidak ada perubahan jadwal tak sengaja). */
  const [scheduleTouched, setScheduleTouched] = useState(!editing);

  const presets = useMemo(() => {
    const list = [...FREQUENCY_PRESETS];
    if (editing && !list.some((p) => p.key === presetKey(editing.frequency, editing.every))) {
      list.push({ key: presetKey(editing.frequency, editing.every), frequency: editing.frequency, every: editing.every, label: frequencyLabel(editing.frequency, editing.every) });
    }
    return list;
  }, [editing]);
  const chosen = presets.find((p) => p.key === preset) ?? presets[2];
  const frequency: Frequency = chosen.frequency;
  const every = chosen.every;
  const pickedDay = inputDay(date) ?? today;
  const dayOfMonth = formDayOfMonth(frequency, endOfMonth, pickedDay, anchor);
  const startDay = alignStart(frequency, dayOfMonth, pickedDay);
  const preview = [startDay];
  while (preview.length < 3) preview.push(nextAfter({ frequency, every, dayOfMonth, startDay }, preview[preview.length - 1]));
  const max = maxText.trim() ? Number(maxText) : null;
  const touch = () => setScheduleTouched(true);

  if (kind === "expense" && wallets.length === 0) {
    return (
      <>
        <p className="muted">Tagihan rutin dipotong dari dompet. Buat dompet dulu, ya.</p>
        <button className="primary" onClick={() => setPanel("wallets")}>👛 Buat dompet</button>
      </>
    );
  }
  if (kind === "saving" && goalChoices.length === 0) {
    return (
      <>
        <p className="muted">Setoran rutin masuk ke goal tabungan. Buat goal dulu, ya.</p>
        <button className="primary" onClick={() => setPanel("goals")}>🎯 Buat goal</button>
      </>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (amount <= 0) return;
    const input: RecurringInput = {
      kind,
      title,
      amount,
      mode,
      note,
      frequency,
      every,
      dayOfMonth,
      firstDue: dayInput(startDay),
      maxOccurrences: max,
      paidBefore: !editing && max !== null ? Number(paidText || 0) : 0,
      ...(kind === "expense"
        ? { category, walletId, source, place: showPlace ? placeInput(place) : null }
        : { goalId })
    };
    if (editing && !scheduleTouched) {
      // Jadwal tidak disentuh: server memakai jadwal yang tersimpan, bukan nextDueDay tab ini (bisa basi).
      Object.assign(input, {
        frequency: editing.frequency,
        every: editing.every,
        dayOfMonth: editing.dayOfMonth,
        firstDue: dayInput(editing.nextDueDay),
        keepSchedule: true
      });
    }
    await saveRecurring(input, editing?.id);
  };

  const heading = editing
    ? `✏️ Ubah ${editing.title}`
    : kind === "saving"
      ? "➕ Setoran rutin ke goal"
      : "➕ Tagihan rutin";
  const goalTitle = goals.find((g) => g.id === goalId)?.title;
  return (
    <form className="add-form rutin-form" onSubmit={submit} data-rutin-form={kind}>
      <h3 className="detail-title">{heading}</h3>
      {kind === "saving" && (
        <label>
          Goal tujuan
          <select value={goalId} onChange={(e) => setGoalId(Number(e.target.value))}>
            {goalChoices.map((g) => (
              <option key={g.id} value={g.id}>
                {g.progress >= 1 ? "🏡" : "🏗️"} {g.title} ({Math.round(g.progress * 100)}%)
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Nama
        <input
          value={title}
          maxLength={MAX_TITLE}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "saving" ? goalTitle ?? "Nabung rutin" : "Spotify, Kos, Cicilan HP…"}
        />
      </label>
      <label>
        Nominal{editing ? " (untuk tagihan berikutnya)" : ""}
        <AmountInput value={amount} onChange={setAmount} placeholder={kind === "saving" ? "100.000" : "54.900"} />
      </label>
      {kind === "expense" && (
        <>
          <div className="two-col">
            <label>
              Kategori
              <CategorySelect value={category ?? LANGGANAN} onChange={setCategory} />
            </label>
            <label>
              Dompet
              <select value={walletId} onChange={(e) => setWalletId(Number(e.target.value))}>
                {!wallets.some((w) => w.id === walletId) && <option value={0}>— pilih dompet —</option>}
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {walletEmoji(w.type)} {w.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Sumber
            <select value={source} onChange={(e) => setSource(e.target.value as "gaji" | "bonus")}>
              <option value="gaji">Gaji</option>
              <option value="bonus">Bonus</option>
            </select>
          </label>
        </>
      )}
      <div className="repeat-fields">
        <div className="two-col">
          <label>
            Ulangi
            <select
              value={preset}
              onChange={(e) => {
                touch();
                setPreset(e.target.value);
              }}
            >
              {presets.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </label>
          <label>
            {editing ? "Jatuh tempo berikutnya" : "Jatuh tempo pertama"}
            <input
              type="date"
              value={date}
              min={dayInput(today)}
              onChange={(e) => {
                touch();
                setAnchor(null);
                setDate(e.target.value);
              }}
              required
            />
          </label>
        </div>
        {frequency === "monthly" && (
          <label className="check">
            <input
              type="checkbox"
              checked={endOfMonth}
              onChange={(e) => {
                touch();
                setEndOfMonth(e.target.checked);
              }}
            />
            📅 Selalu di akhir bulan (tgl 29–31 ikut menyesuaikan)
          </label>
        )}
        <small className="muted rutin-preview">
          {scheduleTouched
            ? `${scheduleLabel({ frequency, every, dayOfMonth, startDay })} · berikutnya ${preview.map(dayShort).join(" · ")}`
            : `${scheduleLabel(editing!)} · berikutnya ${dayLabel(Math.max(editing!.nextDueDay, today))}`}
        </small>
        <div className="two-col">
          <label>
            Berapa kali? (kosong = terus)
            <input
              inputMode="numeric"
              value={maxText}
              onChange={(e) => setMaxText(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
              placeholder="mis. 12 untuk cicilan"
            />
          </label>
          {!editing && max !== null && (
            <label>
              Sudah dibayar sebelumnya
              <input
                inputMode="numeric"
                value={paidText}
                onChange={(e) => setPaidText(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                placeholder="0"
              />
            </label>
          )}
          {editing && editing.maxOccurrences !== null && (
            <small className="muted">Sudah {editing.occurrenceCount} dari {editing.maxOccurrences}.</small>
          )}
        </div>
        {max !== null && (max < 1 || max > MAX_OCCURRENCES) && <p className="cat-hint warn">Jumlahnya 1–{MAX_OCCURRENCES} kali.</p>}
        <label className="check">
          <input type="checkbox" checked={mode === "auto"} onChange={(e) => setMode(e.target.checked ? "auto" : "confirm")} />
          ⚡ Catat otomatis saat jatuh tempo
        </label>
        <small className="muted">
          {mode === "auto"
            ? "Pak Pos langsung mencatatnya (tidak menyalakan lampu streak). Tagihan yang lebih dari 35 hari tidak dibuka tetap menunggu di kotak pos."
            : "Nominal berubah-ubah (listrik, air)? Biarkan mati: Pak Pos mengantar tagihannya, nominal bisa diubah saat Catat."}
        </small>
      </div>
      <label>
        Catatan (opsional)
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "saving" ? "Tiap gajian" : "Paket keluarga"} />
      </label>
      {kind === "expense" &&
        (showPlace ? (
          <PlacePicker value={place} onChange={setPlace} places={places} />
        ) : (
          <button type="button" className="link-btn" onClick={() => setShowPlace(true)}>📍 Tambah tempat (opsional)</button>
        ))}
      <button
        className={`primary ${kind === "expense" ? "spend" : ""}`}
        type="submit"
        disabled={loading || amount <= 0 || (kind === "expense" ? !walletId : !goalId) || (max !== null && (max < 1 || max > MAX_OCCURRENCES))}
      >
        {editing ? "💾 Simpan" : kind === "saving" ? "🔁 Simpan setoran rutin" : "🔁 Simpan tagihan rutin"}
      </button>
    </form>
  );
}

// ── Kotak pos ────────────────────────────────────────────────────────────────

/** Bagian tagihan di panel 📮 Kotak pos: tagihan menunggu, catatan otomatis 7 hari, jatuh tempo segera. */
export function MailboxBills() {
  const available = useVillage((s) => s.snapshot?.recurring.available ?? false);
  const rules = useRules();
  const autoPosted = useVillage((s) => s.snapshot?.recurring.autoPosted);
  const settleBills = useVillage((s) => s.settleBills);
  const openRecurring = useVillage((s) => s.openRecurring);
  const loading = useVillage((s) => s.loading);
  const items = useBills();
  const today = useWibToday();

  const groups = useMemo(() => {
    const byRule = new Map<number, BillItem[]>();
    for (const item of items) {
      const list = byRule.get(item.rule.id);
      if (list) list.push(item);
      else byRule.set(item.rule.id, [item]);
    }
    return [...byRule.values()];
  }, [items]);

  if (!available) return null;
  const payable = items.filter((i) => !i.blocked).slice(0, MAX_SETTLE_BATCH);
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const autos = (autoPosted ?? []).filter((a) => ruleById.has(a.recurringId));
  const upcoming = upcomingDues(rules, today).filter((u) => u.day > today || !items.some((i) => i.rule.id === u.rule.id));

  return (
    <div className="mailbox-bills">
      {items.length > 0 && (
        <section>
          <h3>
            🧾 Tagihan <span className="count">{items.length}</span>
          </h3>
          {payable.length > 1 && (
            <button
              className="pill on bill-all"
              disabled={loading}
              onClick={() => void settleBills(payable.map((i) => ({ id: i.bill.id, action: "pay" })))}
            >
              ✅ Catat semua ({payable.length})
            </button>
          )}
          {groups.map((list) => (
            <BillGroup key={list[0].rule.id} items={list} />
          ))}
        </section>
      )}
      {autos.length > 0 && (
        <section>
          <h3>🔁 Tercatat otomatis (7 hari)</h3>
          <div className="log-list">
            {autos.map((a) => {
              const r = ruleById.get(a.recurringId)!;
              return (
                <div key={a.id} className={`log-row ${r.kind === "saving" ? "save" : "spend"}`}>
                  <span className="muted">{dayShort(a.day)}</span>
                  <span className="log-text">
                    ✓ {r.title}
                    <small className="muted block">{r.kind === "saving" ? `ke ${r.goalTitle ?? "goal"}` : r.walletName ?? ""}</small>
                  </span>
                  <b className={r.kind === "saving" ? "save-text" : "spend-text"}>
                    <Money value={r.kind === "saving" ? a.amount : -a.amount} signed />
                  </b>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {upcoming.length > 0 && (
        <section>
          <h3>📅 Segera</h3>
          <div className="log-list">
            {upcoming.map((u) => (
              <div key={u.rule.id} className="log-row">
                <span className="muted">{dayShort(u.day)}</span>
                <span className="log-text">
                  {ruleIcon(u.rule)} {u.rule.title}
                  <small className="muted block">
                    {dueLabel(u.day, today)} · {u.rule.mode === "auto" ? "⚡ otomatis" : "📮 diantar ke sini"}
                  </small>
                </span>
                <Money value={u.rule.amount} />
              </div>
            ))}
          </div>
        </section>
      )}
      {rules.length === 0 ? (
        <p className="muted small">
          📮 Pak Pos bisa mengantar tagihan rutin (Spotify, kos, cicilan) dan setoran rutin ke kotak pos ini saat jatuh
          tempo.{" "}
          <button className="link-btn inline" onClick={() => openRecurring(null)}>🔁 Atur tagihan rutin</button>
        </p>
      ) : (
        <button className="pill" onClick={() => openRecurring(null)}>🔁 Atur tagihan & setoran rutin</button>
      )}
    </div>
  );
}

function BillGroup({ items }: { items: BillItem[] }) {
  const skipOldBills = useVillage((s) => s.skipOldBills);
  const loading = useVillage((s) => s.loading);
  const [confirmOld, setConfirmOld] = useState(false);
  const rule = items[0].rule;
  const shown = items.slice(0, MAX_BILLS_PER_RULE);
  return (
    <div className="bill-group" data-rule={rule.id}>
      {items.length > 1 && (
        <div className="bill-group-head">
          <span>
            {ruleIcon(rule)} <b>{rule.title}</b> · {items.length} tagihan
          </span>
          {confirmOld ? (
            <span className="confirm-row">
              <span>Lewati {items.length - 1} yang lama?</span>
              <button className="pill danger" disabled={loading} onClick={() => void skipOldBills(rule.id)}>Ya</button>
              <button className="pill ghost" onClick={() => setConfirmOld(false)}>Batal</button>
            </span>
          ) : (
            <button className="link-btn" onClick={() => setConfirmOld(true)}>Lewati yang lama</button>
          )}
        </div>
      )}
      {shown.map((item) => (
        <BillRow key={item.bill.id} item={item} />
      ))}
      {items.length > shown.length && <p className="muted small">+{items.length - shown.length} lagi</p>}
    </div>
  );
}

function BillRow({ item }: { item: BillItem }) {
  const { bill, rule, blocked, overdueDays, ordinal } = item;
  const wallets = useVillage((s) => s.snapshot?.wallets ?? []);
  const settleBills = useVillage((s) => s.settleBills);
  const setRecurringActive = useVillage((s) => s.setRecurringActive);
  const loading = useVillage((s) => s.loading);
  const moneyVisible = useMoneyVisible();
  const needsWallet = rule.kind === "expense" && blocked === "no-wallet";
  const [open, setOpen] = useState(needsWallet);
  const [amount, setAmount] = useState(bill.amount);
  const [walletId, setWalletId] = useState<number>(needsWallet ? (wallets[0]?.id ?? 0) : (rule.walletId ?? 0));
  const [remember, setRemember] = useState(needsWallet);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const due =
    overdueDays === 0 ? "jatuh tempo hari ini" : overdueDays === 1 ? `kemarin (${dayShort(bill.day)})` : `lewat ${overdueDays} hari (${dayShort(bill.day)})`;
  const installment = installmentLabel(ordinal, rule.maxOccurrences);
  const target = rule.kind === "saving" ? `ke ${rule.goalTitle ?? "goal"}` : rule.walletName ? `👛 ${rule.walletName}` : null;
  const wallet = wallets.find((w) => w.id === walletId);
  const minusHint =
    moneyVisible && rule.kind === "expense" && wallet && !wallet.isDebt && wallet.balance - amount < 0 ? `Saldo ${wallet.name} jadi minus.` : null;

  const decision = (): BillDecision => ({
    id: bill.id,
    action: "pay",
    ...(amount !== bill.amount ? { amount } : {}),
    ...(rule.kind === "expense" && walletId && walletId !== rule.walletId ? { walletId, remember } : {})
  });
  const payLabel = rule.kind === "saving" ? (blocked === "goal-done" ? "🪙 Tetap setor" : "🪙 Setor") : "💸 Catat";
  const canPay = blocked !== "no-goal" && amount > 0 && (rule.kind === "saving" || walletId > 0);

  return (
    <div className={`bill-row ${blocked ? "blocked" : ""}`} data-bill={bill.id}>
      <div className="bill-top">
        <span className="rutin-icon">{ruleIcon(rule)}</span>
        <div className="rutin-main">
          <div className="rutin-head">
            <b>{rule.title}</b>
            <Money value={amount} />
          </div>
          <small className={`block ${overdueDays > 0 ? "bill-late" : "muted"}`}>
            {due}
            {target ? ` · ${target}` : ""}
            {installment ? ` · ${installment}` : ""}
          </small>
          {blocked && <small className="block bill-warn">{BLOCK_TEXT[blocked]}</small>}
        </div>
      </div>
      {open && (
        <div className="bill-edit">
          <label>
            Nominal yang dibayar
            <AmountInput value={amount} onChange={setAmount} compact ariaLabel="Nominal tagihan" />
          </label>
          {rule.kind === "expense" && (
            <>
              <label>
                Dompet
                <select value={walletId} onChange={(e) => setWalletId(Number(e.target.value))}>
                  {!wallets.some((w) => w.id === walletId) && <option value={0}>— pilih dompet —</option>}
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {walletEmoji(w.type)} {w.name}
                    </option>
                  ))}
                </select>
              </label>
              {walletId !== rule.walletId && walletId > 0 && (
                <label className="check">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  Pakai dompet ini untuk tagihan berikutnya
                </label>
              )}
              {wallets.length === 0 && <small className="bill-warn">Buat dompet dulu di 👛 Dompet.</small>}
            </>
          )}
          {minusHint && <small className="muted">{minusHint}</small>}
        </div>
      )}
      {confirmSkip ? (
        <div className="confirm-row">
          <span>Lewati tagihan {dayShort(bill.day)}? Tidak ada uang yang dicatat.</span>
          <button className="pill danger" disabled={loading} onClick={() => void settleBills([{ id: bill.id, action: "skip" }])}>
            Ya, lewati
          </button>
          <button className="pill ghost" onClick={() => setConfirmSkip(false)}>Batal</button>
        </div>
      ) : (
        <div className="bill-actions">
          <button className="pill on" disabled={loading || !canPay} onClick={() => void settleBills([decision()])}>
            {payLabel}
          </button>
          <button className="pill ghost" disabled={loading} onClick={() => setConfirmSkip(true)}>Lewati</button>
          {!needsWallet && (
            <button className="icon-btn small" title="Ubah nominal / dompet" onClick={() => setOpen((o) => !o)}>✏️</button>
          )}
          {blocked === "goal-done" && ruleStatus(rule) === "active" && (
            <button className="link-btn" disabled={loading} onClick={() => void setRecurringActive(rule.id, false)}>⏸️ Jeda rutin ini</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Potongan untuk panel lain ────────────────────────────────────────────────

/** Setoran rutin satu goal (detail goal). */
export function GoalRecurring({ goalId, perWeek }: { goalId: number; perWeek?: number }) {
  const available = useVillage((s) => s.snapshot?.recurring.available ?? false);
  const rules = useRules();
  const openRecurring = useVillage((s) => s.openRecurring);
  const today = useWibToday();
  if (!available) return null;
  const mine = rules.filter((r) => r.kind === "saving" && r.goalId === goalId);
  return (
    <section>
      <h3>🔁 Setoran rutin</h3>
      {mine.length === 0 && <p className="muted small">Belum ada. Pak Pos bisa mengingatkan (atau langsung mencatat) setoran tiap minggu / bulan.</p>}
      {mine.map((r) => (
        <button key={r.id} className="log-row rutin-mini" onClick={() => openRecurring({ id: r.id })}>
          <span className="log-text">
            {r.title} · {scheduleLabel(r)}
            <small className="muted block">
              {ruleStatus(r) === "active" ? `berikutnya ${dayLabel(r.nextDueDay)} (${dueLabel(r.nextDueDay, today)})` : ruleStatus(r) === "paused" ? "⏸️ dijeda" : "✓ selesai"}
              {r.mode === "auto" ? " · ⚡ otomatis" : ""}
            </small>
          </span>
          <b className="save-text"><Money value={r.amount} /></b>
        </button>
      ))}
      <button
        className="pill"
        onClick={() =>
          openRecurring({ kind: "saving", goalId, ...(perWeek ? { amount: perWeek, frequency: "weekly", every: 1 } : {}) })
        }
      >
        ➕ Setoran rutin ke goal ini
      </button>
    </section>
  );
}

/** Rutin di bulan yang dilihat (panel Bulan ini): sudah ditangani, menunggu di kotak pos, atau nanti. */
export function MonthRecurring() {
  const available = useVillage((s) => s.snapshot?.recurring.available ?? false);
  const rules = useRules();
  const period = useVillage((s) => s.snapshot?.period);
  const items = useBills();
  const openRecurring = useVillage((s) => s.openRecurring);
  const today = useWibToday();
  if (!available || !period || rules.length === 0) return null;
  const from = wibDayOf(period.year, period.month, 1);
  const to = wibDayOf(period.year, period.month + 1, 1) - 1;
  const pending = new Set(items.map((i) => `${i.rule.id}:${i.bill.day}`));
  const rows = rules.flatMap((r) =>
    occurrencesInRange(r, from, to, 10)
      .filter((d) => d < r.nextDueDay || ruleStatus(r) === "active")
      .map((day) => ({
        rule: r,
        day,
        state: (pending.has(`${r.id}:${day}`) ? "wait" : day < r.nextDueDay ? "done" : day <= today ? "wait" : "later") as
          | "done"
          | "wait"
          | "later"
      }))
  );
  if (!rows.length) return null;
  rows.sort((a, b) => a.day - b.day || a.rule.id - b.rule.id);
  const later = rows.filter((r) => r.state !== "done" && r.rule.kind === "expense").reduce((s, r) => s + r.rule.amount, 0);
  const STATE = { done: "✓", wait: "📮 menunggu", later: "📅 nanti" } as const;
  return (
    <section>
      <h3>🔁 Rutin bulan ini</h3>
      <div className="log-list">
        {rows.slice(0, 20).map((r) => (
          <button key={`${r.rule.id}-${r.day}`} className={`log-row rutin-mini ${r.rule.kind === "saving" ? "save" : "spend"}`} onClick={() => openRecurring({ id: r.rule.id })}>
            <span className="muted">{dayShort(r.day)}</span>
            <span className="log-text">
              {ruleIcon(r.rule)} {r.rule.title} <small className="muted">{STATE[r.state]}</small>
            </span>
            <Money value={r.rule.amount} />
          </button>
        ))}
      </div>
      {later > 0 && (
        <p className="muted small">
          Tagihan yang belum tercatat bulan ini ≈ <Money value={later} />.
        </p>
      )}
    </section>
  );
}
