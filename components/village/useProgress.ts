"use client";

import { useEffect, useMemo, useState } from "react";
import { DAY_MS, WIB_OFFSET_MS, computeStreak, levelFor, villageXp, wibDay } from "@/lib/game";
import { letterKey } from "./daily";
import { useVillage } from "./store";

/** Hari WIB sekarang; berganti sendiri tepat tengah malam WIB tanpa perlu reload. */
export function useWibToday() {
  const [today, setToday] = useState(() => wibDay(Date.now()));
  useEffect(() => {
    const untilMidnight = (today + 1) * DAY_MS - WIB_OFFSET_MS - Date.now();
    const timer = setTimeout(() => setToday(wibDay(Date.now())), Math.max(1000, untilMidnight + 500));
    return () => clearTimeout(timer);
  }, [today]);
  return today;
}

const NO_DAYS: number[] = [];

/** Streak catatan harian + warga, dari snapshot dan tanda "nol pengeluaran" di browser. */
export function useStreak() {
  const activity = useVillage((s) => s.snapshot?.activityDays ?? NO_DAYS);
  const noSpend = useVillage((s) => s.noSpendDays);
  const today = useWibToday();
  return useMemo(() => computeStreak(activity, noSpend, today), [activity, noSpend, today]);
}

export function useVillageXp() {
  const totalSaved = useVillage((s) => s.snapshot?.totals.totalSaved ?? 0);
  const count = useVillage((s) => s.snapshot?.totals.contributionCount ?? 0);
  const xp = villageXp(totalSaved, count);
  return { xp, level: levelFor(xp) };
}

/** Surat minggu ini: insight tepira kalau ada, kalau tidak pratinjau mingguan. */
export function useLetter() {
  const insight = useVillage((s) => s.snapshot?.insight ?? null);
  const read = useVillage((s) => s.letterRead);
  const today = useWibToday();
  const key = letterKey(insight, today);
  return { key, insight, unread: read !== key };
}
