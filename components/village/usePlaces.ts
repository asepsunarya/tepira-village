"use client";

import { useMemo } from "react";
import type { ExpenseView } from "@/lib/game";
import { limitStatus, type LimitLevel } from "@/lib/place-limits";
import { spendByPlaceName, spotKeyFor } from "@/lib/places";
import { placedKiosks } from "./kiosks";
import { useVillage } from "./store";

// Selector zustand harus mengembalikan nilai yang sama antar-render: Map/array baru di dalam
// selector membuat render berulang tanpa henti. Hasil turunan dibangun di useMemo.
const NO_EXPENSES: ExpenseView[] = [];

/** Belanja per nama tempat (semua kategori) di bulan yang dilihat. */
export function useMonthPlaceSpend() {
  const expenses = useVillage((s) => s.snapshot?.expenses ?? NO_EXPENSES);
  return useMemo(() => spendByPlaceName(expenses), [expenses]);
}

export interface LimitView {
  name: string;
  level: LimitLevel;
  spent: number;
  limit: number;
  ratio: number;
}

/** Status batas jajan per kunci titik peta (`n:<nama dinormalkan>`), untuk peta & sidebar. */
export function useLimitViews() {
  const limits = useVillage((s) => s.placeLimits);
  const spend = useMonthPlaceSpend();
  return useMemo(() => {
    const out = new Map<string, LimitView>();
    for (const [key, l] of Object.entries(limits)) {
      const spent = spend.get(key)?.total ?? 0;
      const st = limitStatus(spent, l.limit);
      if (st) out.set(spotKeyFor(key), { name: l.name, level: st.level, spent, limit: l.limit, ratio: st.ratio });
    }
    return out;
  }, [limits, spend]);
}

/** Kios yang berdiri di pulau (kosong selama snapshot belum ada). */
export function useKiosks() {
  const snapshot = useVillage((s) => s.snapshot);
  const limits = useVillage((s) => s.placeLimits);
  return useMemo(() => (snapshot ? placedKiosks(snapshot, limits) : []), [snapshot, limits]);
}
