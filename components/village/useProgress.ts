"use client";

import { useEffect, useMemo, useState } from "react";
import { DAY_MS, WIB_OFFSET_MS, computeStreak, levelFor, villageXp, wibDay } from "@/lib/game";
import { billItems, hasUnannouncedBills, type BillContext, type BillItem } from "@/lib/recurring";
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

/** Streak catatan harian + warga, dari snapshot dan tanda "nol pengeluaran" (tersimpan di akun). */
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

const NO_BILLS: BillItem[] = [];

/** Dompet & progres goal untuk menilai tagihan yang terhalang (dompet dihapus, goal tercapai). */
export function useBillContext(): BillContext {
  const wallets = useVillage((s) => s.snapshot?.wallets);
  const goals = useVillage((s) => s.snapshot?.goals);
  return useMemo(
    () => ({
      walletIds: new Set((wallets ?? []).map((w) => w.id)),
      goalProgress: new Map((goals ?? []).map((g) => [g.id, g.progress]))
    }),
    [wallets, goals]
  );
}

/** Tagihan di kotak pos (paling lama dulu), lengkap dengan aturannya. */
export function useBills(): BillItem[] {
  const recurring = useVillage((s) => s.snapshot?.recurring);
  const ctx = useBillContext();
  const today = useWibToday();
  return useMemo(
    () => (recurring?.available && recurring.bills.length ? billItems(recurring, ctx, today) : NO_BILLS),
    [recurring, ctx, today]
  );
}

/**
 * Kotak pos: surat Cyrene belum dibuka & jumlah tagihan yang menunggu (tanpa nominal). delivered = amplop
 * tagihan boleh tampil (label "🧾 n tagihan", amplop di kotak pos, Pak Pos langsung berdiri di sana): Pak Pos
 * sudah tiba DAN tidak ada tagihan yang belum diumumkan. Tagihan baru, termasuk yang ikut snapshot pertama,
 * baru tampil setelah Pak Pos berjalan dari dermaga mengantarnya.
 */
export function useMail() {
  const { unread } = useLetter();
  const bills = useVillage((s) => (s.snapshot?.recurring.available ? s.snapshot.recurring.bills.length : 0));
  const delivered = useVillage(
    (s) => s.mailDelivered && !(s.snapshot && hasUnannouncedBills(s.snapshot.recurring, s.mailSeen))
  );
  return { unread, bills, delivered };
}
