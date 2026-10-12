"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { formatCompact, monthLabel, periodWord as periodWordFor } from "@/lib/format";
import {
  LABEL_W,
  WATER,
  buildMoneyFlow,
  layoutFlow,
  overflowBy,
  overflowing,
  type FlowBox,
  type FlowItem,
  type MoneyFlow
} from "@/lib/flow";
import { useMoneyVisible, useVillage } from "../store";
import { goalPalette } from "../layout";

/** Nominal ringkas ("Rp324 rb") yang ikut mode privasi. */
function Amount({ value }: { value: number }) {
  const visible = useMoneyVisible();
  return <span className={`money ${visible ? "" : "hidden"}`}>{visible ? formatCompact(value) : "••••"}</span>;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const ring = (color: string) => ({ "--ring": color }) as CSSProperties;

/** Lebar panggung sungai (ikut ukuran layar). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Baris kedua label tujuan; dibuat pendek supaya muat di layar HP. */
function itemSub(item: FlowItem, flow: MoneyFlow, moneyVisible: boolean) {
  if (!moneyVisible) return overflowing(item) ? "meluap dari jatah" : "";
  if (overflowing(item)) return `${formatCompact(item.amount)} · meluap`;
  if (item.budget !== null) return `${formatCompact(item.amount)} / ${formatCompact(item.budget)}`;
  return `${formatCompact(item.amount)} · ${pct(item.amount, flow.total)}%`;
}

/** Potong label panjang (nama goal) sesuai ruang yang ada. */
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…` : text);

/** Satu node sumber/tujuan di kanvas: batang warna + label dua baris. */
function NodeLabel({
  box,
  side,
  flow,
  moneyVisible,
  dim,
  maxChars,
  onPick
}: {
  box: FlowBox;
  side: "left" | "right";
  flow: MoneyFlow;
  moneyVisible: boolean;
  dim: boolean;
  /** jumlah huruf label yang muat */
  maxChars: number;
  onPick: () => void;
}) {
  const { item } = box;
  const cy = box.y + box.h / 2;
  const tx = side === "right" ? box.x + box.w + 8 : box.x - 8;
  const anchor = side === "right" ? "start" : "end";
  const over = overflowing(item);
  const sub = side === "left" ? (moneyVisible ? formatCompact(item.amount) : "") : itemSub(item, flow, moneyVisible);
  return (
    <g
      className={`av-node ${dim ? "dim" : ""} ${over ? "over" : ""}`}
      onClick={onPick}
      role="button"
      tabIndex={0}
      aria-label={moneyVisible ? `${item.label}, ${formatCompact(item.amount)}` : item.label}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
    >
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={Math.min(5, box.h / 2)} fill={item.color} className="av-bar" />
      {/* area klik selebar baris label */}
      <rect
        x={side === "right" ? box.x : box.x - LABEL_W}
        y={Math.min(cy - 20, box.y)}
        width={LABEL_W + box.w}
        height={Math.max(40, box.h)}
        fill="transparent"
      />
      <text x={tx} y={sub ? cy - 3 : cy + 4} textAnchor={anchor} className="av-label">
        {item.icon} {clip(item.label, maxChars)}
        {over ? " 🌊" : ""}
      </text>
      {sub && (
        <text x={tx} y={cy + 12} textAnchor={anchor} className={`av-sub ${over ? "over" : ""}`}>
          {sub}
        </text>
      )}
    </g>
  );
}

/**
 * Kanvas aliran uang layar penuh: mata air (gaji, bonus) → waduk desa → kategori pengeluaran,
 * bangunan goal, tabungan yang disisihkan, dan yang belum terpakai. Rumusnya di lib/flow.ts.
 */
export default function AliranView({ onClose }: { onClose: () => void }) {
  const snapshot = useVillage((s) => s.snapshot);
  const shiftPeriod = useVillage((s) => s.shiftPeriod);
  const setPanel = useVillage((s) => s.setPanel);
  const openGoal = useVillage((s) => s.openGoal);
  const loading = useVillage((s) => s.loading);
  const moneyVisible = useMoneyVisible();
  const [selected, setSelected] = useState<string | null>(null);
  const [stageRef, stageWidth] = useWidth<HTMLDivElement>();
  const closeRef = useRef<HTMLButtonElement>(null);
  // id gradien SVG: key berisi spasi & "/" ("Listrik / Air / Kos") tidak sah di url(#…), jadi pakai indeks.
  const gid = useId().replace(/:/g, "");

  // Fokus keyboard pindah ke dalam tampilan (HUD di belakangnya dibuat inert).
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const summary = snapshot?.summary;
  const goals = snapshot?.goals;
  const expenses = snapshot?.expenses;
  const salary = snapshot?.salary ?? null;
  const flow = useMemo(() => {
    if (!summary || !goals || !expenses) return null;
    // Pita goal berwarna atap bangunannya di pulau.
    const index = new Map(goals.map((g, i) => [g.id, i]));
    const goalColor = (id: number) => goalPalette(index.get(id) ?? 0).roof;
    return buildMoneyFlow({ summary, expenses, goals, salary, goalColor });
  }, [summary, goals, expenses, salary]);
  // Lebar dikurangi padding panggung; sebelum terukur pakai lebar wajar supaya tidak berkedip.
  const layout = useMemo(() => (flow ? layoutFlow(flow, (stageWidth || 640) - 24) : null), [flow, stageWidth]);
  if (!snapshot || !flow || !layout) return null;

  const { month, year } = snapshot.period;
  const periodWord = periodWordFor(snapshot.period);
  const empty = flow.total === 0;
  // Pilihan yang tidak ada lagi (mis. setelah ganti bulan) dianggap tidak ada.
  const picked = selected ? [...flow.sources, ...flow.outs].find((i) => i.key === selected) ?? null : null;
  const activeKey = picked?.key ?? null;
  const outChars = Math.max(8, Math.floor((layout.width - (layout.outs[0]?.x ?? 0) - 30) / 7.5));
  const spills = flow.outs.filter(overflowing);
  const pick = (item: FlowItem) => setSelected((cur) => (cur === item.key ? null : item.key));
  const isDim = (key: string, from?: string, to?: string) =>
    activeKey !== null && key !== activeKey && from !== activeKey && to !== activeKey;
  const saved = flow.outs.filter((o) => o.group === "tabung").reduce((s, o) => s + o.amount, 0);
  const split = [
    { key: "pakai", label: "Dipakai", amount: flow.spent, color: "#f0a06a" },
    { key: "tabung", label: "Ditabung", amount: saved, color: "#2fb57d" },
    { key: "sisa", label: "Belum terpakai", amount: flow.rest, color: WATER }
  ].filter((b) => b.amount > 0);

  return (
    <div className="aliran-view">
      <div className="av-stage" ref={stageRef}>
        {empty ? (
          <div className="av-empty">
            <span className="av-empty-art" aria-hidden>
              🏞️
            </span>
            <b>Sungainya masih kering {periodWord}.</b>
            <span>Atur gaji bulan ini atau catat pengeluaran, nanti airnya mulai mengalir.</span>
          </div>
        ) : (
          <svg
            className="av-svg"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="group"
            aria-label={`Aliran uang ${monthLabel(month, year)}`}
          >
            <defs>
              {layout.links.map((l, i) => (
                <linearGradient key={l.key} id={`${gid}-g${i}`} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor={l.to === "pool" ? l.color : WATER} />
                  <stop offset="100%" stopColor={l.to === "pool" ? WATER : l.color} />
                </linearGradient>
              ))}
              <linearGradient id={`${gid}-pool`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#b5e6fb" />
                <stop offset="100%" stopColor="#5cb8e6" />
              </linearGradient>
            </defs>

            {layout.links.map((l, i) => (
              <g key={l.key} className={`av-link ${isDim(l.key, l.from, l.to) ? "dim" : ""}`}>
                <path d={l.d} fill={`url(#${gid}-g${i})`} />
                <path
                  d={l.center}
                  className="av-current"
                  strokeWidth={Math.max(1, Math.min(5, l.thickness * 0.3))}
                  style={{ animationDuration: `${1.2 + 18 / Math.max(4, l.thickness)}s` }}
                />
              </g>
            ))}

            {/* waduk desa */}
            <g className={`av-pool ${activeKey ? "dim" : ""}`}>
              <rect
                x={layout.pool.x - 4}
                y={layout.pool.y - 6}
                width={layout.pool.w + 8}
                height={layout.pool.h + 12}
                rx={12}
                fill="#e9d9b5"
              />
              <rect x={layout.pool.x} y={layout.pool.y} width={layout.pool.w} height={layout.pool.h} rx={9} fill={`url(#${gid}-pool)`} />
              <text x={layout.pool.x + layout.pool.w / 2} y={layout.pool.y - 14} textAnchor="middle" className="av-label">
                💧 Waduk
              </text>
            </g>

            {layout.sources.map((b) => (
              <NodeLabel
                key={b.item.key}
                box={b}
                side="left"
                flow={flow}
                moneyVisible={moneyVisible}
                dim={isDim(b.item.key)}
                maxChars={12}
                onPick={() => pick(b.item)}
              />
            ))}
            {layout.outs.map((b) => (
              <NodeLabel
                key={b.item.key}
                box={b}
                side="right"
                flow={flow}
                moneyVisible={moneyVisible}
                dim={isDim(b.item.key)}
                maxChars={outChars}
                onPick={() => pick(b.item)}
              />
            ))}
          </svg>
        )}
      </div>

      <aside className="jv-side av-side card">
        <header className="jv-head">
          <div>
            <h2>🌊 Aliran uang</h2>
            <div className="jv-month">
              <button className="icon-btn small" onClick={() => void shiftPeriod(-1)} title="Bulan sebelumnya" disabled={loading}>
                ‹
              </button>
              <span>{monthLabel(month, year)}</span>
              <button className="icon-btn small" onClick={() => void shiftPeriod(1)} title="Bulan berikutnya" disabled={loading}>
                ›
              </button>
            </div>
          </div>
          <button ref={closeRef} className="icon-btn" onClick={onClose} title="Kembali ke desa (Esc)" aria-label="Kembali ke desa">
            ✕
          </button>
        </header>

        <div className="jv-body">
          <section className="jv-hero av-hero">
            <small>Masuk {periodWord}</small>
            <div className="jv-big">
              <Amount value={flow.income} />
            </div>
            <small>
              {flow.deficit > 0 ? (
                <>
                  🏺 Nombok <Amount value={flow.deficit} /> dari saldo dompet
                </>
              ) : flow.rest > 0 ? (
                <>
                  💧 <Amount value={flow.rest} /> belum terpakai
                </>
              ) : empty ? (
                "Belum ada arus."
              ) : (
                "Habis terbagi semua."
              )}
            </small>
          </section>

          {split.length > 0 && (
            <section>
              <div className="av-split" aria-hidden>
                {split.map((b) => (
                  <span key={b.key} style={{ flexGrow: b.amount, background: b.color }} />
                ))}
              </div>
              <div className="av-legend">
                {split.map((b) => (
                  <span key={b.key}>
                    <i style={{ background: b.color }} /> {b.label}
                    {moneyVisible ? ` ${pct(b.amount, flow.total)}%` : ""}
                  </span>
                ))}
              </div>
            </section>
          )}

          {picked && (
            <section className="jv-place av-picked">
              <div className="jv-place-head">
                <span className="jv-ico" style={ring(picked.color)}>
                  {picked.icon}
                </span>
                <span className="jv-main">
                  <b>{picked.label}</b>
                  <small>
                    <Amount value={picked.amount} />
                    {moneyVisible && flow.total > 0 ? ` · ${pct(picked.amount, flow.total)}% dari aliran` : ""}
                    {picked.kind === "spend" ? ` · ${picked.count} catatan` : ""}
                  </small>
                </span>
                <button className="icon-btn small" onClick={() => setSelected(null)} title="Tutup" aria-label="Tutup">
                  ✕
                </button>
              </div>
              {picked.budget !== null && (
                <>
                  {moneyVisible && (
                    <span className="bar thin">
                      <span
                        style={{
                          width: `${Math.min(100, pct(picked.fromSalary, picked.budget))}%`,
                          background: overflowing(picked) ? "#e86d6d" : picked.color
                        }}
                      />
                    </span>
                  )}
                  <p className={`cat-hint ${overflowing(picked) ? "over" : ""}`}>
                    {overflowing(picked) ? (
                      <>
                        🌊 Meluap <Amount value={overflowBy(picked)} /> dari jatah <Amount value={picked.budget} />
                      </>
                    ) : picked.fromSalary === picked.budget ? (
                      <>
                        Jatah <Amount value={picked.budget} /> pas terpakai semua.
                      </>
                    ) : (
                      <>
                        Masih ada <Amount value={picked.budget - picked.fromSalary} /> dari jatah <Amount value={picked.budget} />
                      </>
                    )}
                  </p>
                  {picked.amount > picked.fromSalary && (
                    <small className="muted">
                      Termasuk <Amount value={picked.amount - picked.fromSalary} /> dari bonus (tidak memakai jatah gaji).
                    </small>
                  )}
                </>
              )}
              {picked.kind === "spend" && picked.budget === null && snapshot.salary && (
                <p className="cat-hint">Kategori ini tidak punya jatah di alokasi gaji {periodWord}.</p>
              )}
              {picked.kind === "goal" && picked.goalId !== null && (
                <button className="pill" onClick={() => openGoal(picked.goalId)}>
                  🏡 Buka goal
                </button>
              )}
              {picked.kind === "sisih" && <p className="cat-hint">Alokasi tabungan gaji yang belum disetor ke goal mana pun.</p>}
              {picked.kind === "dompet" && (
                <p className="cat-hint warn">
                  {flow.income > 0
                    ? "Yang keluar lebih besar dari gaji & bonus, jadi sisanya diambil dari saldo dompet."
                    : "Gaji & bonus bulan ini belum tercatat, jadi semua yang keluar terhitung dari saldo dompet."}
                </p>
              )}
              {picked.kind === "sisa" && (
                <p className="cat-hint">
                  Pemasukan yang belum dipakai atau ditabung. Beda dengan &quot;Sisa budget&quot; yang hanya menghitung jatah belanja.
                </p>
              )}
            </section>
          )}

          {spills.length > 0 && (
            <section>
              <h3>
                🌊 Meluap dari jatah <small>{spills.length}</small>
              </h3>
              <div className="jv-list">
                {spills.map((s) => (
                  <button key={s.key} className={`jv-row over ${activeKey === s.key ? "on" : ""}`} onClick={() => pick(s)}>
                    <span className="jv-ico" style={ring(s.color)}>
                      {s.icon}
                    </span>
                    <span className="jv-main">
                      <b>{s.label}</b>
                      <small>
                        jatah <Amount value={s.budget ?? 0} />
                      </small>
                    </span>
                    <span className="jv-amt">
                      +<Amount value={overflowBy(s)} />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {empty ? (
            <div className="chips">
              <button className="pill salary-open" onClick={() => setPanel("salary")}>
                💰 Atur alokasi gaji
              </button>
              <button className="pill" onClick={() => setPanel("spend")}>
                💸 Catat pengeluaran
              </button>
            </div>
          ) : (
            !snapshot.salary && (
              <p className="jv-note">
                Gaji {periodWord} belum dialokasikan, jadi belum ada jatah per kategori.{" "}
                <button className="link-btn" onClick={() => setPanel("salary")}>
                  Atur sekarang
                </button>
              </p>
            )
          )}

          <p className="jv-note">
            Tebal sungai = besar nominal. Setoran ke goal diambil dari alokasi tabungan gaji dulu; alokasi yang belum
            disetor tampil sebagai 🐷 Disisihkan. Saldo awal bukan pemasukan (sama dengan Laporan tepira); bonus & saldo
            awal diatur lewat tepira.id.
          </p>
        </div>
      </aside>
    </div>
  );
}
