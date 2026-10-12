"use client";

import { useMemo } from "react";
import { MAX_VILLAGERS, wibDay, wibDayDate, type GoalView } from "@/lib/game";
import { MONTHS_ID, monthLabel } from "@/lib/format";
import {
  SEASONS,
  festivalFor,
  habitYear,
  nextSeasonChange,
  seasonForMonth,
  wibDayOf,
  wibDateParts,
  yearProgress,
  type HabitState
} from "@/lib/season";
import { SEASON_LOOK, useReducedMotion } from "../seasons";
import { useVillage } from "../store";
import { useStreak, useVillageXp, useWibToday } from "../useProgress";

const NO_DAYS: number[] = [];
const NO_GOALS: GoalView[] = [];

const HABIT_WORD: Record<HabitState, string> = {
  recorded: "tercatat",
  nospend: "nol pengeluaran",
  missed: "terlewat",
  future: "belum",
  before: "belum ada data"
};
const LEGEND: HabitState[] = ["recorded", "nospend", "missed", "before", "future"];

/** "Jan", "Feb", …, "Agu", "Okt", "Des". */
const shortMonth = (month: number) => MONTHS_ID[month - 1]?.slice(0, 3) ?? String(month);
const monthSpan = (months: readonly number[]) => `${shortMonth(months[0])}–${shortMonth(months[months.length - 1])}`;
const dayLabel = (day: number, options: Intl.DateTimeFormatOptions) =>
  wibDayDate(day).toLocaleDateString("id-ID", { ...options, timeZone: "UTC" });

/**
 * Jurnal tahun ini: hari ke-N (WIB), musim sekarang & berikutnya, musim per bulan (klik = lihat desa
 * bulan itu), kalender kebiasaan mencatat, dan ringkasan setahun. Semua dari snapshot + tanda nol
 * pengeluaran di browser; tidak ada query tambahan dan tidak ada nominal.
 */
export default function JournalPanel() {
  const today = useWibToday();
  const period = useVillage((s) => s.snapshot?.period ?? null);
  const activity = useVillage((s) => s.snapshot?.activityDays ?? NO_DAYS);
  const goals = useVillage((s) => s.snapshot?.goals ?? NO_GOALS);
  const noSpend = useVillage((s) => s.noSpendDays);
  const loading = useVillage((s) => s.loading);
  const setPeriod = useVillage((s) => s.setPeriod);
  const reduceFx = useVillage((s) => s.ui.reduceFx ?? false);
  const toggleUi = useVillage((s) => s.toggleUi);
  const streak = useStreak();
  const { level } = useVillageXp();
  const reducedMotion = useReducedMotion();

  const progress = yearProgress(today);
  const { year } = progress;
  const habit = useMemo(() => habitYear(activity, noSpend, year, today), [activity, noSpend, year, today]);
  const goalsThisYear = useMemo(
    () => goals.filter((g) => wibDateParts(wibDay(g.createdAt)).year === year).length,
    [goals, year]
  );
  if (!period) return null;
  // Deret sekarang dihitung sejak 1 Januari saja, sama seperti deret terpanjang di sebelahnya.
  const daysThisYear = today - wibDayOf(year, 1) + (streak.todayDone ? 1 : 0);
  const currentThisYear = Math.min(streak.current, daysThisYear);

  const now = wibDateParts(today);
  const nowSeason = seasonForMonth(now.month);
  const info = SEASONS[nowSeason];
  const next = nextSeasonChange(today);
  const nextInfo = SEASONS[next.season];
  const nextDate = dayLabel(next.day, {
    day: "numeric",
    month: "short",
    ...(wibDateParts(next.day).year !== year ? { year: "numeric" } : {})
  });
  const viewedSeason = seasonForMonth(period.month);
  const fxOn = !reduceFx;

  return (
    <>
      <div className="score-card">
        <div
          className="hall-ring big"
          style={{ background: `conic-gradient(#f3c35b ${Math.round(progress.fraction * 100)}%, #f1e4ea 0)` }}
        >
          <span>{progress.dayOfYear}</span>
        </div>
        <div>
          <b>
            Hari ke-{progress.dayOfYear} dari {progress.daysInYear}
          </b>
          <small className="muted block">
            {dayLabel(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} ·{" "}
            {progress.daysLeft === 0 ? "hari terakhir tahun ini" : `${progress.daysLeft} hari lagi menuju ${year + 1}`}
          </small>
        </div>
      </div>

      <div className={`journal-season ${nowSeason}`}>
        <span className="journal-season-emoji" aria-hidden>
          {info.emoji}
        </span>
        <div>
          <small className="muted">Musim sekarang · {monthSpan(info.months)}</small>
          <b className="block">{info.name}</b>
          <p>{info.blurb}</p>
          <small className="muted block">🏝️ Di pulau: {SEASON_LOOK[nowSeason].island}</small>
          {festivalFor(now.month) && (
            <small className="muted block">🎉 Agustusan: bendera merah putih berkibar di tiap lampu jalan.</small>
          )}
        </div>
      </div>
      <p className="intro">
        {nextInfo.emoji} {nextInfo.name} mulai {nextDate},{" "}
        {next.inDays === 1 ? "besok" : `${next.inDays} hari lagi`}.
      </p>
      {viewedSeason !== nowSeason && (
        <div className="intro journal-viewing">
          <span>
            Pulau sedang menampilkan {SEASONS[viewedSeason].emoji} {SEASONS[viewedSeason].name.toLowerCase()} karena
            kamu melihat {monthLabel(period.month, period.year)}.
          </span>
          <button className="pill" disabled={loading} onClick={() => void setPeriod(now.month, now.year)}>
            ↩ Kembali ke bulan ini
          </button>
        </div>
      )}

      <section>
        <h3>🗓️ Musim {year}</h3>
        <div className="season-strip">
          {Array.from({ length: 12 }, (_, i) => {
            const month = i + 1;
            const s = seasonForMonth(month);
            const viewed = period.month === month && period.year === year;
            const isNow = now.month === month && now.year === year;
            const label = `${MONTHS_ID[i]} ${year} · ${SEASONS[s].name}${festivalFor(month) ? " · 🎉 Agustusan" : ""}${isNow ? " · bulan ini" : ""}`;
            return (
              <button
                key={month}
                className={`season-chip ${s} ${viewed ? "on" : ""} ${isNow ? "now" : ""}`}
                disabled={loading}
                onClick={() => void setPeriod(month, year)}
                title={label}
                aria-label={label}
                aria-pressed={viewed}
              >
                <span aria-hidden>{SEASONS[s].emoji}</span>
                <small aria-hidden>{shortMonth(month)}</small>
              </button>
            );
          })}
        </div>
        <p className="muted small">Klik bulan untuk melihat desa (dan musimnya) di bulan itu.</p>
      </section>

      <section>
        <h3>
          📅 Kebiasaan mencatat <span className="count">{habit.done} hari</span>
        </h3>
        <div
          className="habit-grid"
          role="img"
          aria-label={`Kalender mencatat ${year}: ${habit.done} dari ${habit.elapsed} hari tercatat`}
        >
          {habit.months.map((m) => (
            <div key={m.month} className="habit-row">
              <small>{shortMonth(m.month)}</small>
              {m.days.map((state, d) => {
                const day = m.start + d;
                const isToday = day === today;
                return (
                  <i
                    key={d}
                    className={`habit-dot ${state}${isToday ? " today" : ""}`}
                    title={`${d + 1} ${shortMonth(m.month)} · ${isToday && state === "future" ? "hari ini, belum tercatat" : HABIT_WORD[state]}`}
                  />
                );
              })}
              <small className="habit-count">{m.done || ""}</small>
            </div>
          ))}
        </div>
        <div className="habit-legend">
          {LEGEND.map((s) => (
            <span key={s}>
              <i className={`habit-dot ${s}`} /> {HABIT_WORD[s]}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h3>🏝️ {year} sejauh ini</h3>
        <div className="detail-grid">
          <div>
            <small>Hari tercatat</small>
            <b>
              {habit.done} / {habit.elapsed}
            </b>
          </div>
          <div>
            <small>Deret terpanjang</small>
            <b>{habit.longestRun} hari</b>
          </div>
          <div>
            <small>Deret sekarang</small>
            <b>{currentThisYear} hari</b>
          </div>
          <div>
            <small>Goal dibuat</small>
            <b>{goalsThisYear}</b>
          </div>
          <div>
            <small>Warga</small>
            <b>
              {streak.villagers}/{MAX_VILLAGERS}
            </b>
          </div>
          <div>
            <small>Level desa</small>
            <b>Lv{level}</b>
          </div>
        </div>
      </section>

      <section>
        <h3>✨ Efek musim</h3>
        <div className="journal-fx">
          <span className="muted small">
            Hujan, pelangi, kunang-kunang, layangan, kupu-kupu, dan daun gugur. Warna pulau, genangan, pojok musim, dan
            bendera tetap tampil.
          </span>
          <button className={`pill ${fxOn ? "on" : ""}`} aria-pressed={fxOn} onClick={() => toggleUi("reduceFx")}>
            {fxOn ? "Nyala" : "Mati"}
          </button>
        </div>
        {reducedMotion && fxOn && (
          <p className="muted small">
            Perangkatmu meminta gerakan dikurangi, jadi hujan, kunang-kunang, kupu-kupu, dan daun gugur tidak
            ditampilkan.
          </p>
        )}
      </section>

      <p className="muted small">
        Hari ke-N dan kalender memakai kalender WIB. Hari tercatat = ada pengeluaran atau setoran hari itu. Tanda nol
        pengeluaran tersimpan di perangkat ini saja, jadi kalender di perangkat lain bisa sedikit berbeda.
      </p>
    </>
  );
}
