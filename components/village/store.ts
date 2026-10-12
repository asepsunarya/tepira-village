"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  NOSPEND_BACKFILL_DAYS,
  VILLAGE_UNLOCKS,
  VILLAGER_NAMES,
  computeStreak,
  levelFor,
  villageXp,
  wibDay
} from "@/lib/game";
import type { ActionResult, Snapshot } from "@/lib/game";
import * as actions from "@/app/village/actions";
import type { MapThemeSetting, Panel, TimeOfDay, VillagerTarget, WorldToast } from "./types";
import { HALL, LAMP_POSTS, UNLOCK_SPOTS, WARUNG, goalPlot } from "./layout";
import { formatCompact } from "@/lib/format";
import { readLetter, readNoSpend, readSeen, writeLetter, writeNoSpend, writeSeen } from "./daily";
import {
  NO_HITS,
  captureBaseline,
  clampTourStep,
  readTour,
  tourOwner,
  writeTour,
  type TourBaseline,
  type TourHits,
  type TourStatus
} from "./tutorial/progress";

/** Preferensi visual saja; tersimpan di browser. Data uang selalu dari server. */
export interface UiSettings {
  time: TimeOfDay;
  showLabels: boolean;
  hideMoney: boolean;
  freeze: boolean;
  /** suasana peta jajan; kosong (simpanan lama) = "desa" */
  mapTheme?: MapThemeSetting;
}

/** Tur desa (coach mark) untuk pengguna baru. Progres per user di localStorage, bukan di DB. */
export interface TourState {
  /** email pemilik progres; null = belum diinisialisasi */
  owner: string | null;
  active: boolean;
  step: number;
  /** halaman di dalam langkah info bertahap */
  page: number;
  baseline: TourBaseline | null;
}

const IDLE_TOUR: TourState = { owner: null, active: false, step: 0, page: 0, baseline: null };

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
  /** Hari "nol pengeluaran" (hari WIB) milik user yang login; disimpan di browser (daily.ts). */
  noSpendDays: number[];
  /** Kunci surat terakhir yang sudah dibuka (letterKey di daily.ts). */
  letterRead: string | null;

  hydrate: (snapshot: Snapshot) => void;
  setPanel: (panel: Panel) => void;
  openGoal: (goalId: number | null) => void;
  openWallet: (walletId: number | null) => void;
  setTime: (time: TimeOfDay) => void;
  toggleUi: (key: "showLabels" | "hideMoney" | "freeze") => void;
  setMapTheme: (theme: MapThemeSetting) => void;
  unlock: (pin: string) => Promise<boolean>;
  lock: () => void;
  resetView: () => void;
  dismissToast: (id: string) => void;
  setPeriod: (month: number, year: number) => Promise<void>;
  shiftPeriod: (delta: number) => Promise<void>;

  refresh: () => Promise<void>;
  createGoal: (input: Parameters<typeof actions.createGoal>[0]) => Promise<boolean>;
  /** Atur (yyyy-mm-dd) atau hapus (null) target tanggal goal. */
  updateGoalDeadline: (goalId: number, deadline: string | null) => Promise<boolean>;
  deleteGoal: (goalId: number) => Promise<void>;
  save: (input: { goalId: number; amount: number; note?: string }) => Promise<boolean>;
  deleteContribution: (id: number) => Promise<void>;
  updateContribution: (id: number, input: Parameters<typeof actions.updateContribution>[1]) => Promise<boolean>;
  spend: (input: Parameters<typeof actions.addExpense>[0]) => Promise<boolean>;
  deleteExpense: (id: number) => Promise<void>;
  updateExpense: (id: number, input: Parameters<typeof actions.updateExpense>[1]) => Promise<boolean>;
  createWallet: (input: Parameters<typeof actions.createWallet>[0]) => Promise<boolean>;
  updateWallet: (id: number, input: Parameters<typeof actions.updateWallet>[1]) => Promise<boolean>;
  deleteWallet: (id: number) => Promise<void>;
  saveSalary: (input: Parameters<typeof actions.saveSalaryAllocation>[0]) => Promise<boolean>;
  /** Hapus baris alokasi yang sedang dilihat (id dari snapshot.salary). */
  deleteSalary: (salaryId: number) => Promise<void>;
  /** Tandai/batalkan "nol pengeluaran" untuk satu hari WIB (lampunya ikut menyala). */
  toggleNoSpend: (day: number) => void;
  markLetterRead: (key: string) => void;

  tour: TourState;
  /** Setoran & pengeluaran yang berhasil sejak halaman dibuka (untuk tur). */
  tourHits: TourHits;
  /**
   * Sekali per user: lanjutkan tur yang belum selesai, atau mulai otomatis kalau server
   * menilai akun ini baru (lihat isNewVillager di lib/snapshot.ts).
   */
  initTour: (isNew: boolean) => void;
  /** Mulai/lompat ke langkah tertentu (baseline diambil ulang). */
  startTour: (step?: number) => void;
  setTourPage: (page: number) => void;
  /** Ambil ulang baseline, mis. setelah pindah bulan. */
  rebaseTour: () => void;
  endTour: (status: Exclude<TourStatus, "active">) => void;
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
          celebrateSoon();
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

      /**
       * Rayakan warga baru & bangunan level yang baru terbuka, sekali per user: yang sudah dirayakan
       * diingat di browser. Pertama kali (belum ada catatan) hanya mencatat diam-diam.
       */
      const celebrate = () => {
        const s = get().snapshot;
        if (!s) return;
        const owner = tourOwner(s);
        const villagers = computeStreak(s.activityDays, get().noSpendDays, wibDay(Date.now())).villagers;
        const level = levelFor(villageXp(s.totals.totalSaved, s.totals.contributionCount));
        const seen = readSeen(owner);
        if (!seen) {
          writeSeen(owner, { villagers, level });
          return;
        }
        const news: string[] = [];
        if (villagers > seen.villagers) {
          const names = VILLAGER_NAMES.slice(seen.villagers, villagers).join(" & ");
          news.push(`🧑‍🌾 ${names} pindah ke desa!`);
          pushToast({ x: HALL.x, z: HALL.z + 3.2, y: 4.2, text: "🧑‍🌾 Warga baru!", sub: names, tone: "info" });
        }
        for (const u of VILLAGE_UNLOCKS.filter((u) => u.level > seen.level && u.level <= level)) {
          news.push(`${u.emoji} ${u.name} terbuka!`);
          const spot = UNLOCK_SPOTS[u.key];
          pushToast({ x: spot.x, z: spot.z, y: 4.6, text: `${u.emoji} ${u.name} terbuka!`, sub: `Level ${u.level}`, tone: "info" });
        }
        if (news.length) notify(news.join(" "));
        // Yang sempat berkurang (mis. setoran dihapus) tidak dirayakan ulang saat naik lagi.
        if (villagers > seen.villagers || level > seen.level) {
          writeSeen(owner, { villagers: Math.max(villagers, seen.villagers), level: Math.max(level, seen.level) });
        }
      };
      /** Ditunda sebentar supaya pesan aksinya ("setoran tercatat" dst.) sempat terbaca dulu. */
      const celebrateSoon = () => setTimeout(celebrate, 1600);

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
        noSpendDays: [],
        letterRead: null,
        tour: IDLE_TOUR,
        tourHits: NO_HITS,

        hydrate: (snapshot) => {
          const unlockedBefore =
            typeof window !== "undefined" && sessionStorage.getItem("tepira_village_unlocked") === "true";
          const owner = tourOwner(snapshot);
          set({
            snapshot,
            unlocked: snapshot.pinRequired ? unlockedBefore : true,
            noSpendDays: readNoSpend(owner),
            letterRead: readLetter(owner)
          });
          // Warga/bangunan yang bertambah sejak kunjungan terakhir (mis. mencatat lewat tepira.id).
          setTimeout(celebrate, 900);
        },
        setPanel: (panel) => set({ panel }),
        openGoal: (goalId) => set({ selectedGoalId: goalId, panel: goalId ? "goals" : get().panel }),
        openWallet: (walletId) => set({ selectedWalletId: walletId, panel: walletId ? "wallets" : get().panel }),
        setTime: (time) => set((s) => ({ ui: { ...s.ui, time } })),
        toggleUi: (key) => set((s) => ({ ui: { ...s.ui, [key]: !s.ui[key] } })),
        setMapTheme: (mapTheme) => set((s) => ({ ui: { ...s.ui, mapTheme } })),
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
        updateGoalDeadline: async (goalId, deadline) => {
          const ok = await mutate(() => actions.updateGoalDeadline(goalId, deadline, period()));
          if (ok) notify(deadline ? "Target tanggal disimpan 🗓️" : "Target tanggal dihapus.");
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
            set((s) => ({ tourHits: { ...s.tourHits, save: s.tourHits.save + 1, saveGoalId: input.goalId } }));
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
        updateContribution: async (id, input) => {
          const ok = await mutate(() => actions.updateContribution(id, input, period()));
          if (ok) notify("Setoran diperbarui.");
          return ok;
        },
        spend: async (input) => {
          const ok = await mutate(() => actions.addExpense(input, period()));
          if (ok) {
            set((s) => ({ tourHits: { ...s.tourHits, spend: s.tourHits.spend + 1 } }));
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
        updateExpense: async (id, input) => {
          const ok = await mutate(() => actions.updateExpense(id, input, period()));
          if (ok) notify("Pengeluaran diperbarui & saldo dompet disesuaikan.");
          return ok;
        },
        createWallet: async (input) => mutate(() => actions.createWallet(input, period())),
        updateWallet: async (id, input) => mutate(() => actions.updateWallet(id, input, period())),
        deleteWallet: async (id) => {
          const ok = await mutate(() => actions.deleteWallet(id, period()));
          if (ok) set({ selectedWalletId: null });
        },
        saveSalary: async (input) => {
          const hadSalary = Boolean(get().snapshot?.salary);
          const ok = await mutate(() => actions.saveSalaryAllocation(input, period()));
          if (ok) {
            // Si penabung lapor ke Balai Desa. Toast tanpa nominal: gaji lebih sensitif.
            walkTo(HALL.x + 1.4, HALL.z + 3.4, "save");
            pushToast({
              x: HALL.x,
              z: HALL.z,
              y: 5.2,
              text: hadSalary ? "💰 Alokasi diperbarui" : "💰 Gaji dibagi!",
              sub: "Tiap rupiah sudah punya tugas",
              tone: "info"
            });
            notify(hadSalary ? "Alokasi gaji diperbarui 💰" : "Gaji bulan ini sudah dialokasikan 💰");
          }
          return ok;
        },
        deleteSalary: async (salaryId) => {
          const ok = await mutate(() => actions.deleteSalaryAllocation(salaryId, period()));
          if (ok) notify("Alokasi gaji bulan ini dihapus.");
        },

        toggleNoSpend: (day) => {
          const s = get().snapshot;
          if (!s) return;
          const today = wibDay(Date.now());
          const current = get().noSpendDays;
          const had = current.includes(day);
          // Membatalkan selalu boleh; menandai hanya dalam batas mundur.
          if (!had && (day > today || day < today - NOSPEND_BACKFILL_DAYS)) return;
          const days = writeNoSpend(tourOwner(s), had ? current.filter((d) => d !== day) : [...current, day], today);
          set({ noSpendDays: days });
          if (had) return;
          const lamp = LAMP_POSTS[6 - (today - day)];
          if (lamp) pushToast({ x: lamp[0], z: lamp[1], y: 3.4, text: "💡", sub: "Nol pengeluaran", tone: "info" });
          notify(day === today ? "🌙 Hari ini ditandai nol pengeluaran. Lampunya menyala!" : "🌙 Hari itu ditandai nol pengeluaran.");
          celebrateSoon();
        },
        markLetterRead: (key) => {
          const s = get().snapshot;
          if (!s || get().letterRead === key) return;
          writeLetter(tourOwner(s), key);
          set({ letterRead: key });
        },

        initTour: (isNew) => {
          const s = get().snapshot;
          if (!s) return;
          const owner = tourOwner(s);
          if (get().tour.owner === owner) return;
          const stored = readTour(owner);
          const hits = get().tourHits;
          if (stored?.status === "active") {
            set({ tour: { owner, active: true, step: stored.step, page: 0, baseline: captureBaseline(s, hits) } });
          } else if (!stored && isNew) {
            writeTour(owner, { status: "active", step: 0 });
            set({ tour: { owner, active: true, step: 0, page: 0, baseline: captureBaseline(s, hits) } });
          } else {
            set({ tour: { ...IDLE_TOUR, owner } });
          }
        },
        startTour: (step = 0) => {
          const s = get().snapshot;
          if (!s) return;
          const owner = tourOwner(s);
          const next = clampTourStep(step);
          writeTour(owner, { status: "active", step: next });
          set({ tour: { owner, active: true, step: next, page: 0, baseline: captureBaseline(s, get().tourHits) } });
        },
        setTourPage: (page) => set((st) => ({ tour: { ...st.tour, page: Math.max(0, page) } })),
        rebaseTour: () => {
          const s = get().snapshot;
          if (!s) return;
          set((st) => ({ tour: { ...st.tour, baseline: captureBaseline(s, st.tourHits, st.tour.baseline) } }));
        },
        endTour: (status) => {
          const { tour, snapshot } = get();
          if (!tour.active) return;
          if (snapshot) writeTour(tour.owner ?? tourOwner(snapshot), { status, step: tour.step });
          set({ tour: { ...tour, active: false, page: 0, baseline: null } });
          notify(
            status === "done"
              ? "Tur selesai! Selamat menabung teu pira 🐷"
              : "Tur ditutup. Buka lagi kapan saja lewat tombol ❓"
          );
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

// persist tidak mendengar tab lain: tanpa ini tab lama (mis. landing dengan demo yang terus
// memanggil setState) menulis balik preferensi basi, termasuk mode sembunyikan angka.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    try {
      if (e.storageArea === window.localStorage && (e.key === "tepira-village-ui" || e.key === null)) {
        void useVillage.persist.rehydrate();
      }
    } catch {
      // storage diblokir: preferensi cukup diingat di tab ini
    }
  });
}

/** Apakah angka boleh ditampilkan sekarang. */
export function useMoneyVisible() {
  return useVillage((s) => s.unlocked && !s.ui.hideMoney);
}
