"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ActionResult, Snapshot } from "@/lib/game";
import * as actions from "@/app/village/actions";
import type { Panel, TimeOfDay, VillagerTarget, WorldToast } from "./types";
import { WARUNG, goalPlot } from "./layout";
import { formatCompact } from "@/lib/format";

/** Preferensi visual saja; tersimpan di browser. Data uang selalu dari server. */
export interface UiSettings {
  time: TimeOfDay;
  showLabels: boolean;
  hideMoney: boolean;
  freeze: boolean;
}

interface State {
  snapshot: Snapshot | null;
  loading: boolean;
  error: string | null;
  notice: string | null;
  ui: UiSettings;
  unlocked: boolean;
  panel: Panel;
  selectedGoalId: number | null;
  selectedWalletId: number | null;
  toasts: WorldToast[];
  villagerTarget: VillagerTarget | null;
  viewNonce: number;
  celebrateGoalId: number | null;

  hydrate: (snapshot: Snapshot) => void;
  setPanel: (panel: Panel) => void;
  openGoal: (goalId: number | null) => void;
  openWallet: (walletId: number | null) => void;
  setTime: (time: TimeOfDay) => void;
  toggleUi: (key: Exclude<keyof UiSettings, "time">) => void;
  unlock: (pin: string) => Promise<boolean>;
  lock: () => void;
  resetView: () => void;
  dismissToast: (id: string) => void;
  setPeriod: (month: number, year: number) => Promise<void>;
  shiftPeriod: (delta: number) => Promise<void>;

  refresh: () => Promise<void>;
  createGoal: (input: Parameters<typeof actions.createGoal>[0]) => Promise<boolean>;
  deleteGoal: (goalId: number) => Promise<void>;
  save: (input: { goalId: number; amount: number; note?: string }) => Promise<boolean>;
  deleteContribution: (id: number) => Promise<void>;
  spend: (input: Parameters<typeof actions.addExpense>[0]) => Promise<boolean>;
  deleteExpense: (id: number) => Promise<void>;
  createWallet: (input: Parameters<typeof actions.createWallet>[0]) => Promise<boolean>;
  updateWallet: (id: number, input: Parameters<typeof actions.updateWallet>[1]) => Promise<boolean>;
  deleteWallet: (id: number) => Promise<void>;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export const useVillage = create<State>()(
  persist(
    (set, get) => {
      let errorTimer: ReturnType<typeof setTimeout> | undefined;
      let noticeTimer: ReturnType<typeof setTimeout> | undefined;

      const fail = (message: string) => {
        set({ error: message, loading: false });
        clearTimeout(errorTimer);
        errorTimer = setTimeout(() => set({ error: null }), 5000);
      };
      const notify = (message: string) => {
        set({ notice: message });
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => set({ notice: null }), 3200);
      };
      const period = () => {
        const s = get().snapshot;
        const now = new Date();
        return s ? s.period : { month: now.getMonth() + 1, year: now.getFullYear() };
      };
      const apply = (result: ActionResult) => {
        if (result.ok) {
          set({ snapshot: result.snapshot, loading: false, error: null });
          return true;
        }
        fail(result.message);
        return false;
      };
      const mutate = async (fn: () => Promise<ActionResult>) => {
        set({ loading: true });
        try {
          return apply(await fn());
        } catch (error) {
          fail(error instanceof Error ? error.message : "Terjadi kesalahan.");
          return false;
        }
      };
      const pushToast = (toast: Omit<WorldToast, "id" | "createdAt">) => {
        const t: WorldToast = { ...toast, id: uid(), createdAt: Date.now() };
        set((s) => ({ toasts: [...s.toasts, t] }));
        setTimeout(() => get().dismissToast(t.id), 2800);
      };
      const walkTo = (x: number, z: number, kind: VillagerTarget["kind"]) =>
        set((s) => ({ villagerTarget: { x, z, kind, nonce: (s.villagerTarget?.nonce ?? 0) + 1 } }));

      return {
        snapshot: null,
        loading: false,
        error: null,
        notice: null,
        ui: { time: "auto", showLabels: true, hideMoney: false, freeze: false },
        unlocked: false,
        panel: null,
        selectedGoalId: null,
        selectedWalletId: null,
        toasts: [],
        villagerTarget: null,
        viewNonce: 0,
        celebrateGoalId: null,

        hydrate: (snapshot) => {
          const unlockedBefore =
            typeof window !== "undefined" && sessionStorage.getItem("tepira_village_unlocked") === "true";
          set({ snapshot, unlocked: snapshot.pinRequired ? unlockedBefore : true });
        },
        setPanel: (panel) => set({ panel }),
        openGoal: (goalId) => set({ selectedGoalId: goalId, panel: goalId ? "goals" : get().panel }),
        openWallet: (walletId) => set({ selectedWalletId: walletId, panel: walletId ? "wallets" : get().panel }),
        setTime: (time) => set((s) => ({ ui: { ...s.ui, time } })),
        toggleUi: (key) => set((s) => ({ ui: { ...s.ui, [key]: !s.ui[key] } })),
        unlock: async (pin) => {
          const res = await actions.verifyPin(pin);
          if (res.success) {
            sessionStorage.setItem("tepira_village_unlocked", "true");
            set({ unlocked: true });
            return true;
          }
          fail("PIN salah.");
          return false;
        },
        lock: () => {
          sessionStorage.removeItem("tepira_village_unlocked");
          set({ unlocked: false });
        },
        resetView: () => set((s) => ({ viewNonce: s.viewNonce + 1 })),
        dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

        setPeriod: async (month, year) => {
          const ok = await mutate(() => actions.fetchSnapshot({ month, year }));
          if (ok && typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.set("month", String(month));
            url.searchParams.set("year", String(year));
            window.history.replaceState(null, "", url);
          }
        },
        shiftPeriod: async (delta) => {
          const p = period();
          let month = p.month + delta;
          let year = p.year;
          if (month < 1) {
            month = 12;
            year -= 1;
          } else if (month > 12) {
            month = 1;
            year += 1;
          }
          await get().setPeriod(month, year);
        },

        refresh: async () => {
          await mutate(() => actions.fetchSnapshot(period()));
        },

        createGoal: async (input) => {
          const ok = await mutate(() => actions.createGoal(input, period()));
          if (ok) notify(`Kavling baru dibuka: "${input.title}" 🏗️`);
          return ok;
        },
        deleteGoal: async (goalId) => {
          const ok = await mutate(() => actions.deleteGoal(goalId, period()));
          if (ok) set({ selectedGoalId: null });
        },
        save: async (input) => {
          const before = get().snapshot?.goals.find((g) => g.id === input.goalId);
          const ok = await mutate(() => actions.addContribution(input, period()));
          if (ok) {
            const snap = get().snapshot!;
            const idx = snap.goals.findIndex((g) => g.id === input.goalId);
            const after = snap.goals[idx];
            if (idx >= 0) {
              const plot = goalPlot(idx);
              walkTo(plot.x, plot.z + 3.2, "save");
              pushToast({
                x: plot.x,
                z: plot.z,
                y: 4.6,
                text: `+${formatCompact(input.amount)}`,
                sub: after ? `${Math.round(after.progress * 100)}% · ${after.title}` : undefined,
                tone: "save"
              });
              if (before && after && before.progress < 1 && after.progress >= 1) {
                set({ celebrateGoalId: after.id });
                notify(`🎉 Goal "${after.title}" tercapai! Bangunannya selesai.`);
                setTimeout(() => set({ celebrateGoalId: null }), 6000);
              } else {
                notify("Setoran teu pira tercatat. Bangunan bertambah tinggi! 🧱");
              }
            }
          }
          return ok;
        },
        deleteContribution: async (id) => {
          await mutate(() => actions.deleteContribution(id, period()));
        },
        spend: async (input) => {
          const ok = await mutate(() => actions.addExpense(input, period()));
          if (ok) {
            walkTo(WARUNG.x - 1.2, WARUNG.z + 3.4, "spend");
            pushToast({
              x: WARUNG.x,
              z: WARUNG.z,
              y: 4.4,
              text: `-${formatCompact(input.amount)}`,
              sub: input.category || "Pengeluaran",
              tone: "spend"
            });
            notify("Pengeluaran tercatat & saldo dompet diperbarui.");
          }
          return ok;
        },
        deleteExpense: async (id) => {
          const ok = await mutate(() => actions.deleteExpense(id, period()));
          if (ok) notify("Pengeluaran dihapus, saldo dompet dikembalikan.");
        },
        createWallet: async (input) => mutate(() => actions.createWallet(input, period())),
        updateWallet: async (id, input) => mutate(() => actions.updateWallet(id, input, period())),
        deleteWallet: async (id) => {
          const ok = await mutate(() => actions.deleteWallet(id, period()));
          if (ok) set({ selectedWalletId: null });
        }
      };
    },
    {
      name: "tepira-village-ui",
      version: 1,
      partialize: (s) => ({ ui: s.ui })
    }
  )
);

/** Apakah angka boleh ditampilkan sekarang. */
export function useMoneyVisible() {
  return useVillage((s) => s.unlocked && !s.ui.hideMoney);
}
