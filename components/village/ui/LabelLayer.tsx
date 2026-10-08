"use client";

import type { ReactNode } from "react";
import { buildStage, levelFor, levelTitle, villageXp, walletEmoji, xpForLevel } from "@/lib/game";
import { formatCompact } from "@/lib/format";
import { HALL, WARUNG, goalPalette, goalPlot, walletSpot } from "../layout";
import { useMoneyVisible, useVillage } from "../store";
import { useWorldLabel, type Anchor } from "../scene/labels";

function WorldLabel({
  id,
  position,
  anchor = "above",
  children
}: {
  id: string;
  position: [number, number, number];
  anchor?: Anchor;
  children: ReactNode;
}) {
  const ref = useWorldLabel(id, position, anchor);
  return (
    <div ref={ref} className="world-label" style={{ display: "none" }}>
      {children}
    </div>
  );
}

const STAGE_LABEL: Record<ReturnType<typeof buildStage>, string> = {
  lahan: "Lahan kosong",
  fondasi: "Fondasi",
  dinding: "Dinding naik",
  atap: "Pasang atap",
  selesai: "Selesai!"
};

function GoalLabels() {
  const goals = useVillage((s) => s.snapshot?.goals ?? []);
  const selectedId = useVillage((s) => (s.panel === "goals" ? s.selectedGoalId : null));
  const moneyVisible = useMoneyVisible();
  return (
    <>
      {goals.map((goal, i) => {
        const plot = goalPlot(i);
        const pal = goalPalette(i);
        const done = goal.progress >= 1;
        const percent = Math.round(goal.progress * 100);
        const selected = selectedId === goal.id;
        return (
          <WorldLabel key={goal.id} id={`goal-${goal.id}`} position={[plot.x, done ? 5.6 : 4.1, plot.z]}>
            <div className={`goal-label ${done ? "is-done" : ""} ${selected ? "is-selected" : ""}`}>
              <div className="goal-label-title">
                <span>{done ? "🏡" : "🏗️"}</span>
                <span className="goal-label-name">{goal.title}</span>
                <span className="goal-label-pct">{percent}%</span>
              </div>
              <div className="goal-label-bar">
                <div style={{ width: `${percent}%`, background: pal.roof }} />
              </div>
              <div className="goal-label-sub">
                {moneyVisible ? `${formatCompact(goal.saved)} / ${formatCompact(goal.targetAmount)}` : "•••• / ••••"}
                <span className="goal-label-stage">{STAGE_LABEL[buildStage(goal.progress)]}</span>
              </div>
            </div>
          </WorldLabel>
        );
      })}
    </>
  );
}

function WalletLabels() {
  const wallets = useVillage((s) => s.snapshot?.wallets ?? []);
  const selectedId = useVillage((s) => (s.panel === "wallets" ? s.selectedWalletId : null));
  const moneyVisible = useMoneyVisible();
  return (
    <>
      {wallets.map((w, i) => {
        const spot = walletSpot(i);
        const selected = selectedId === w.id;
        return (
          <WorldLabel key={w.id} id={`wallet-${w.id}`} position={[spot.x, 2.4, spot.z]}>
            <div className={`name-pill ${w.isDebt ? "is-debt" : ""} ${selected ? "is-selected" : ""}`}>
              <span className="name-emoji">{walletEmoji(w.type)}</span>
              <span>{w.name}</span>
              <span className={`lv ${w.isDebt ? "debt" : ""}`}>
                {moneyVisible ? `${w.isDebt ? "-" : ""}${formatCompact(Math.abs(w.balance))}` : "••••"}
              </span>
            </div>
          </WorldLabel>
        );
      })}
    </>
  );
}

function WarungLabel() {
  const summary = useVillage((s) => s.snapshot?.summary);
  const moneyVisible = useMoneyVisible();
  const over = summary?.budget.status === "OVER_BUDGET";
  return (
    <WorldLabel id="warung" position={[WARUNG.x, 4.6, WARUNG.z]}>
      <div className={`goal-label warung ${over ? "is-over" : ""}`}>
        <div className="goal-label-title">
          <span>🛒</span>
          <span className="goal-label-name">Warung</span>
          {summary && (
            <span className={`goal-label-pct ${over ? "over" : ""}`}>
              {summary.budget.status === "NO_BUDGET" ? `${summary.expenses.count}x` : over ? "over budget" : "aman"}
            </span>
          )}
        </div>
        <div className="goal-label-sub">
          Pengeluaran bulan ini: <b>{moneyVisible && summary ? formatCompact(summary.expenses.total) : "••••"}</b>
        </div>
      </div>
    </WorldLabel>
  );
}

function HallLabel() {
  const totals = useVillage((s) => s.snapshot?.totals);
  const health = useVillage((s) => s.snapshot?.summary.health);
  const xp = totals ? villageXp(totals.totalSaved, totals.contributionCount) : 0;
  const level = levelFor(xp);
  const next = xpForLevel(level + 1);
  const cur = xpForLevel(level);
  const pct = Math.round(((xp - cur) / Math.max(1, next - cur)) * 100);
  const score = health?.score ?? 0;
  const scoreColor = score >= 85 ? "#2fb57d" : score >= 70 ? "#5b9ae0" : score >= 55 ? "#e0b84a" : "#e86d6d";
  return (
    <WorldLabel id="hall" position={[HALL.x, 9.6, HALL.z - 1.6]}>
      <div className="hall-label">
        <div className="hall-ring" style={{ background: `conic-gradient(${scoreColor} ${score}%, #f1e4ea 0)` }}>
          <span>{score}</span>
        </div>
        <div className="hall-main">
          <div className="hall-title">
            🏛️ Balai Desa <span className="lv">Lv{level}</span>
          </div>
          <div className="hall-sub">{levelTitle(level)}</div>
          <div className="goal-label-bar">
            <div style={{ width: `${pct}%`, background: "#f3c35b" }} />
          </div>
          <div className="hall-sub muted">
            {xp.toLocaleString("id-ID")} / {next.toLocaleString("id-ID")} XP · {health?.status ?? "–"}
          </div>
        </div>
      </div>
    </WorldLabel>
  );
}

function VillagerLabel() {
  const user = useVillage((s) => s.snapshot?.user);
  const totals = useVillage((s) => s.snapshot?.totals);
  const level = totals ? levelFor(villageXp(totals.totalSaved, totals.contributionCount)) : 1;
  const name = user?.name?.split(" ")[0] || "Kamu";
  // Posisi dimutasi tiap frame oleh <Villager/> lewat labelRegistry.
  return (
    <WorldLabel id="villager" position={[HALL.x, -0.15, HALL.z + 3.2]} anchor="center">
      <div className="name-pill is-you">
        <span className="name-emoji">🐷</span>
        <span>{name}</span>
        <span className="lv">Lv{level}</span>
      </div>
    </WorldLabel>
  );
}

function ToastLabels() {
  const toasts = useVillage((s) => s.toasts);
  return (
    <>
      {toasts.map((t) => (
        <WorldLabel key={t.id} id={`toast-${t.id}`} position={[t.x, t.y, t.z]} anchor="center">
          <div className={`xp-toast tone-${t.tone}`}>
            <div className="xp-toast-main">{t.text}</div>
            {t.sub && <div className="xp-toast-sub">{t.sub}</div>}
          </div>
        </WorldLabel>
      ))}
    </>
  );
}

/** Lapisan DOM di atas Canvas untuk semua label dunia. */
export default function LabelLayer() {
  const showLabels = useVillage((s) => s.ui.showLabels);
  return (
    <div className="label-layer" aria-hidden>
      {showLabels && (
        <>
          <GoalLabels />
          <WalletLabels />
          <WarungLabel />
          <HallLabel />
          <VillagerLabel />
        </>
      )}
      <ToastLabels />
    </div>
  );
}
