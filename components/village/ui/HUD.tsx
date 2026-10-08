"use client";

import { useState } from "react";
import { levelFor, levelTitle, villageXp, xpForLevel } from "@/lib/game";
import { monthLabel } from "@/lib/format";
import { signOutAction } from "@/app/village/actions";
import { useVillage } from "../store";
import type { Panel, TimeOfDay } from "../types";
import { Money } from "./Money";

const TIMES: { key: TimeOfDay; icon: string; label: string }[] = [
  { key: "auto", icon: "🪄", label: "Otomatis (ikut skor kesehatan)" },
  { key: "day", icon: "☀️", label: "Siang" },
  { key: "cloudy", icon: "⛅", label: "Berawan" },
  { key: "sunset", icon: "🌇", label: "Senja" },
  { key: "night", icon: "🌙", label: "Malam" }
];

const DOCK: { key: Exclude<Panel, null>; icon: string; label: string }[] = [
  { key: "goals", icon: "🎯", label: "Goal" },
  { key: "save", icon: "🪙", label: "Nabung" },
  { key: "spend", icon: "💸", label: "Catat" },
  { key: "wallets", icon: "👛", label: "Dompet" },
  { key: "log", icon: "📜", label: "Riwayat" },
  { key: "month", icon: "📊", label: "Bulan ini" }
];

export default function HUD() {
  const snapshot = useVillage((s) => s.snapshot);
  const ui = useVillage((s) => s.ui);
  const unlocked = useVillage((s) => s.unlocked);
  const loading = useVillage((s) => s.loading);
  const error = useVillage((s) => s.error);
  const notice = useVillage((s) => s.notice);
  const panel = useVillage((s) => s.panel);
  const setPanel = useVillage((s) => s.setPanel);
  const setTime = useVillage((s) => s.setTime);
  const toggleUi = useVillage((s) => s.toggleUi);
  const resetView = useVillage((s) => s.resetView);
  const shiftPeriod = useVillage((s) => s.shiftPeriod);
  const lock = useVillage((s) => s.lock);
  const [menu, setMenu] = useState(false);

  if (!snapshot) return null;
  const { totals, summary, period, user } = snapshot;
  const xp = villageXp(totals.totalSaved, totals.contributionCount);
  const level = levelFor(xp);
  const next = xpForLevel(level + 1);
  const cur = xpForLevel(level);
  const xpPct = Math.round(((xp - cur) / Math.max(1, next - cur)) * 100);
  const doneGoals = snapshot.goals.filter((g) => g.progress >= 1).length;
  const budget = summary.budget;
  const score = summary.health.score;
  const scoreTone = score >= 85 ? "great" : score >= 70 ? "good" : score >= 55 ? "ok" : "bad";
  const moneyShown = unlocked && !ui.hideMoney;

  return (
    <>
      <div className="hud-top-left card">
        <div className="hud-brand">
          <span className="brand-dot">t</span>
          <div>
            <b>tepira</b> village
            <small>desa tabunganmu · {monthLabel(period.month, period.year)}</small>
          </div>
          <button
            className="pill ghost"
            onClick={() => (snapshot.pinRequired && unlocked ? lock() : toggleUi("hideMoney"))}
            title={moneyShown ? "Sembunyikan angka" : "Tampilkan angka"}
          >
            {moneyShown ? "🙈" : "👁️"}
          </button>
        </div>

        <div className="level-row">
          <span className="lv big">Lv{level}</span>
          <div className="level-main">
            <div className="level-title">{levelTitle(level)}</div>
            <div className="bar thin">
              <div style={{ width: `${xpPct}%`, background: "#f3c35b" }} />
            </div>
            <small className="muted">
              {xp.toLocaleString("id-ID")} / {next.toLocaleString("id-ID")} XP · {totals.contributionCount} setoran
            </small>
          </div>
        </div>

        <div className="stat-grid">
          <div className="stat-tile save">
            <small>Total ditabung</small>
            <b><Money value={totals.totalSaved} /></b>
          </div>
          <div className="stat-tile">
            <small>Kekayaan bersih</small>
            <b><Money value={totals.netWorth} /></b>
          </div>
          <div className="stat-tile spend">
            <small>Pengeluaran bulan ini</small>
            <b><Money value={summary.expenses.total} /></b>
          </div>
          <div className={`stat-tile ${budget.status === "OVER_BUDGET" ? "spend" : ""}`}>
            <small>{budget.status === "NO_BUDGET" ? "Budget belum diatur" : "Sisa budget"}</small>
            <b>{budget.status === "NO_BUDGET" ? "—" : <Money value={budget.remaining} />}</b>
          </div>
        </div>

        <div className="stat-row">
          <span className={`stat score ${scoreTone}`}>
            <i className="dot" /> <b>{score}</b> skor · {summary.health.status}
          </span>
          <span className="stat">
            🏡 <b>{doneGoals}</b>/{snapshot.goals.length} goal selesai
          </span>
          <span className={`stat ${loading ? "offline" : "live"}`}>
            <i className={`dot ${loading ? "off" : "pulse"}`} /> {loading ? "MENYIMPAN…" : "TERSAMBUNG"}
          </span>
        </div>
      </div>

      <div className="hud-top-center">
        <div className="card segmented">
          <button className="seg" onClick={() => void shiftPeriod(-1)} title="Bulan sebelumnya">‹</button>
          <span className="seg-label">{monthLabel(period.month, period.year)}</span>
          <button className="seg" onClick={() => void shiftPeriod(1)} title="Bulan berikutnya">›</button>
        </div>
        <div className="card segmented">
          {TIMES.map((t) => (
            <button key={t.key} className={`seg ${ui.time === t.key ? "on" : ""}`} onClick={() => setTime(t.key)} title={t.label}>
              {t.icon}
            </button>
          ))}
        </div>
        <button className={`card pill-lg ${ui.showLabels ? "on" : ""}`} onClick={() => toggleUi("showLabels")}>🏷️ Label</button>
        <button className={`card pill-lg ${ui.freeze ? "on" : ""}`} onClick={() => toggleUi("freeze")}>🧊 Kunci kamera</button>
        <button className="card pill-lg" onClick={resetView} title="Kembali ke sudut pandang awal">🎯 Reset view</button>
      </div>

      <div className="hud-user card">
        <button className="user-btn" onClick={() => setMenu((m) => !m)}>
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" className="avatar-img" referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar">{(user.name ?? user.email ?? "?").slice(0, 1).toUpperCase()}</span>
          )}
          <span className="user-name">{user.name ?? user.email}</span>
        </button>
        {menu && (
          <div className="user-menu">
            <small className="muted">{user.email}</small>
            {snapshot.devLogin && <small className="dev-badge">DEV LOGIN aktif</small>}
            <form action={signOutAction}>
              <button className="pill" type="submit">↪ Keluar</button>
            </form>
          </div>
        )}
      </div>

      {error && <div className="hud-error card">⚠️ {error}</div>}
      {!error && notice && <div className="hud-error card ok">{notice}</div>}

      <div className="hud-hint">🖱️ drag untuk putar · scroll untuk zoom · klik bangunan untuk detail</div>

      <div className="dock card">
        {DOCK.map((d) => (
          <button
            key={d.key}
            className={`dock-btn ${panel === d.key ? "on" : ""}`}
            onClick={() => setPanel(panel === d.key ? null : d.key)}
            title={d.label}
          >
            <span>{d.icon}</span>
            <small>{d.label}</small>
          </button>
        ))}
      </div>
    </>
  );
}
