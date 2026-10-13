"use client";

import { useState } from "react";
import { levelFor, levelTitle, nextUnlock, villageXp, xpForLevel } from "@/lib/game";
import { monthLabel } from "@/lib/format";
import { SEASONS, seasonForMonth } from "@/lib/season";
import { signOutAction } from "@/app/village/actions";
import { LogoMark } from "@/components/brand/Logo";
import { useVillage } from "../store";
import { isFullscreenPanel, type Panel, type TimeOfDay } from "../types";
import { useStreak } from "../useProgress";
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
  { key: "salary", icon: "💰", label: "Gaji" },
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
  const startTour = useVillage((s) => s.startTour);
  const streak = useStreak();
  const bills = useVillage((s) => (s.snapshot?.recurring.available ? s.snapshot.recurring.bills.length : 0));
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
  const upcoming = nextUnlock(level);
  const toggleVillage = () => setPanel(panel === "village" ? null : "village");
  const toggleFlow = () => setPanel(panel === "aliran" ? null : "aliran");
  // Tampilan layar penuh menutupi HUD: jangan sampai fokus keyboard tertinggal di tombol yang tersembunyi.
  const covered = isFullscreenPanel(panel);

  return (
    <>
      <div className="hud-top-left card" data-tour="hud-stats" inert={covered}>
        <div className="hud-brand">
          <LogoMark size={36} className="brand-dot" />
          <div>
            <b>tepira</b> village
            <small>desa tabunganmu · {monthLabel(period.month, period.year)}</small>
          </div>
          <button
            className="pill ghost tour-replay"
            onClick={() => startTour(0, true)}
            title="Tur desa: ulangi panduan"
            aria-label="Ulangi tur desa"
            data-tour="tour-replay"
          >
            ❓
          </button>
          <button
            className="pill ghost"
            onClick={() => (snapshot.pinRequired && unlocked ? lock() : toggleUi("hideMoney"))}
            title={moneyShown ? "Sembunyikan angka" : "Tampilkan angka"}
          >
            {moneyShown ? "🙈" : "👁️"}
          </button>
        </div>

        <div className="level-row clickable" onClick={toggleVillage} role="button" title="Bangunan yang terbuka per level">
          <span className="lv big">Lv{level}</span>
          <div className="level-main">
            <div className="level-title">
              {levelTitle(level)}
              {upcoming && (
                <span className="level-next">
                  · {upcoming.emoji} {upcoming.name} di Lv{upcoming.level}
                </span>
              )}
            </div>
            <div className="bar thin">
              <div style={{ width: `${xpPct}%`, background: "#f3c35b" }} />
            </div>
            <small className="muted">
              {/* XP bisa dihitung balik jadi total tabungan, jadi ikut disembunyikan. */}
              {moneyShown ? `${xp.toLocaleString("id-ID")} / ${next.toLocaleString("id-ID")} XP` : "•••• XP"} ·{" "}
              {totals.contributionCount} setoran
            </small>
          </div>
        </div>

        <button
          className={`streak-row ${streak.todayDone ? "done" : "todo"}`}
          onClick={toggleVillage}
          title="Lampu streak & warga desa"
          data-tour="hud-streak"
        >
          <span className="streak-fire">{streak.current > 0 ? "🔥" : "🕯️"}</span>
          <span className="streak-main">
            <b>{streak.current}</b> hari beruntun
          </span>
          <span className="streak-today">{streak.todayDone ? "hari ini ✓" : "catat hari ini"}</span>
          <span className="streak-folk" title="Warga desa">
            🧑‍🌾 {streak.villagers}
          </span>
        </button>

        <div className="stat-grid">
          <div className="stat-tile save">
            <small>Total ditabung</small>
            <b><Money value={totals.totalSaved} /></b>
          </div>
          <div className="stat-tile">
            <small>Kekayaan bersih</small>
            <b><Money value={totals.netWorth} /></b>
          </div>
          {/* Baris kontrol atas sudah penuh di layar 1400 px, jadi aliran uang dibuka dari dua kotak ini. */}
          <button className="stat-tile spend link" onClick={toggleFlow} title="Aliran uang: ke mana saja uang bulan ini mengalir">
            <small>Pengeluaran bulan ini</small>
            <b><Money value={summary.expenses.total} /></b>
          </button>
          <button
            className={`stat-tile link ${budget.status === "OVER_BUDGET" ? "spend" : ""}`}
            onClick={toggleFlow}
            title="Aliran uang: ke mana saja uang bulan ini mengalir"
          >
            <small>{budget.status === "NO_BUDGET" ? "Budget belum diatur" : "Sisa budget"}</small>
            <b>{budget.status === "NO_BUDGET" ? "—" : <Money value={budget.remaining} />}</b>
          </button>
        </div>

        <div className="stat-row">
          <span className={`stat score ${scoreTone}`}>
            <i className="dot" /> <b>{score}</b> skor · {summary.health.status}
          </span>
          <span className="stat">
            🏡 <b>{doneGoals}</b>/{snapshot.goals.length} goal selesai
          </span>
          {/* Jumlah saja (tanpa nama/nominal); di HP kotak pos 3D terlalu kecil, jadi ini pintunya. */}
          {bills > 0 && (
            <button
              className={`stat mail ${panel === "letter" ? "on" : ""}`}
              onClick={() => setPanel(panel === "letter" ? null : "letter")}
              title="Tagihan rutin menunggu di kotak pos"
            >
              📮 <b>{bills}</b> tagihan
            </button>
          )}
          <span className={`stat ${loading ? "offline" : "live"}`}>
            <i className={`dot ${loading ? "off" : "pulse"}`} /> {loading ? "MENYIMPAN…" : "TERSAMBUNG"}
          </span>
        </div>
      </div>

      <div className="hud-top-center" inert={covered}>
        <div className="card segmented" data-tour="period-nav">
          <button className="seg" onClick={() => void shiftPeriod(-1)} title="Bulan sebelumnya">‹</button>
          {/* Label bulan = pintu ke jurnal tahun ini; emojinya musim pulau di bulan yang dilihat. */}
          <button
            className={`seg-label seg-btn ${panel === "journal" ? "on" : ""}`}
            onClick={() => setPanel(panel === "journal" ? null : "journal")}
            title={`Jurnal tahun & musim · ${SEASONS[seasonForMonth(period.month)].name}`}
          >
            <span className="seg-season" aria-hidden>
              {SEASONS[seasonForMonth(period.month)].emoji}
            </span>
            {monthLabel(period.month, period.year)}
          </button>
          <button className="seg" onClick={() => void shiftPeriod(1)} title="Bulan berikutnya">›</button>
        </div>
        <div className="card segmented">
          {TIMES.map((t) => (
            <button key={t.key} className={`seg ${ui.time === t.key ? "on" : ""}`} onClick={() => setTime(t.key)} title={t.label}>
              {t.icon}
            </button>
          ))}
        </div>
        <button
          className={`card pill-lg ${panel === "jajan" ? "on" : ""}`}
          onClick={() => setPanel(panel === "jajan" ? null : "jajan")}
          title="Di mana uangmu paling banyak keluar"
        >
          🗺️ Peta jajan
        </button>
        <button className={`card pill-lg ${ui.showLabels ? "on" : ""}`} onClick={() => toggleUi("showLabels")}>🏷️ Label</button>
        <button className={`card pill-lg ${ui.freeze ? "on" : ""}`} onClick={() => toggleUi("freeze")}>🧊 Kunci kamera</button>
        <button className="card pill-lg" onClick={resetView} title="Kembali ke sudut pandang awal">🎯 Reset view</button>
      </div>

      <div className="hud-user card" inert={covered}>
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

      <div className="dock card" inert={covered}>
        {DOCK.map((d) => (
          <button
            key={d.key}
            className={`dock-btn ${panel === d.key ? "on" : ""}`}
            onClick={() => setPanel(panel === d.key ? null : d.key)}
            title={d.label}
            data-tour={`dock-${d.key}`}
          >
            <span>{d.icon}</span>
            <small>{d.label}</small>
          </button>
        ))}
      </div>
    </>
  );
}
