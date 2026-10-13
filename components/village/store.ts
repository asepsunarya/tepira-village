"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { VILLAGE_UNLOCKS, VILLAGER_NAMES, computeStreak, levelFor, villageXp, wibDay } from "@/lib/game";
import type { ActionResult, Snapshot } from "@/lib/game";
import * as actions from "@/app/village/actions";
import { isFullscreenPanel, type MapThemeSetting, type Panel, type TimeOfDay, type VillagerTarget, type WorldToast } from "./types";
import { HALL, LAMP_POSTS, MAILBOX, MAILBOX_FRONT, UNLOCK_SPOTS, WARUNG, goalPlot, kioskFront } from "./layout";
import { newMail, type BillDecision, type RecurringInput } from "@/lib/recurring";
import { formatCompact, periodWord } from "@/lib/format";
import { isDemoSnapshot } from "@/lib/demo-snapshot";
import { normalizePlaceName, spendByPlaceName, spotKeyFor } from "@/lib/places";
import {
  LIMIT_EMOJI,
  LIMIT_RANK,
  LIMIT_WORD,
  MAX_LIMIT,
  MAX_PLACE_LIMITS,
  NO_LIMITS,
  findPlaceLimit,
  limitStatus,
  withPlaceLimit,
  type PlaceLimits
} from "@/lib/place-limits";
import {
  LOCAL_SYNC,
  MAX_OPS_PER_CALL,
  MAX_PLACE_NAME,
  cleanPlaceName,
  deriveView,
  isTerminalTour,
  newerSync,
  noSpendAllowed,
  sameNumberList,
  samePlaceLimits,
  sameSeen,
  sameStoredTour,
  type Seen,
  type StoredTour,
  type SyncOp,
  type SyncOpInput,
  type VillageSync
} from "@/lib/village-sync";
import { SYNC_PREFIX, prepareOutbox, readSyncCache, updateSyncCache } from "./daily";
import { placedKiosks } from "./kiosks";
import {
  NO_HITS,
  captureBaseline,
  clampTourStep,
  tourOwner,
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
  /**
   * Matikan efek musim (hujan, pelangi, kunang-kunang, layangan, kupu-kupu, daun gugur). Sengaja
   * negatif: kosong (simpanan lama) = efek nyala, dan toggleUi membalik `undefined` jadi true.
   */
  reduceFx?: boolean;
}

/** Isian awal form 🔁 (dari Riwayat "Jadikan rutin", goal, dst.); id = mengubah aturan yang sudah ada. */
export type RecurringDraft = Partial<RecurringInput> & { id?: number };

/** Tur desa (coach mark) untuk pengguna baru. Status & langkah tersimpan di akun (storedTour), sisanya per tab. */
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
  /**
   * Data desa per user versi server terakhir yang diketahui tab ini (snapshot.sync atau hasil
   * syncVillage). Bukan untuk ditampilkan: tampilannya noSpendDays…storedTour di bawah.
   */
  syncBase: VillageSync;
  /** Op yang belum dikonfirmasi server (cermin outbox di localStorage, daily.ts). */
  syncOutbox: SyncOp[];
  // Tampilan = deriveView(syncBase, syncOutbox): perubahan langsung terlihat walau belum terkirim.
  /** Hari "nol pengeluaran" (hari WIB) milik user yang login. */
  noSpendDays: number[];
  /** Kunci surat terakhir yang sudah dibuka (letterKey di daily.ts). */
  letterRead: string | null;
  /** Batas jajan per tempat milik user yang login. */
  placeLimits: PlaceLimits;
  /** Warga & level yang sudah dirayakan; null = belum pernah. */
  seen: Seen | null;
  /** Progres tur yang tersimpan di akun. */
  storedTour: StoredTour | null;
  /** id tagihan rutin tertinggi yang sudah diumumkan Pak Pos (tersimpan di akun). */
  mailSeen: number | null;
  /** Pak Pos berjalan ke kotak pos tiap nonce bertambah (ada kiriman baru). */
  postman: { nonce: number } | null;
  /** Amplop tagihan baru tampil di kotak pos setelah Pak Pos tiba (atau langsung tanpa animasi). */
  mailDelivered: boolean;
  /** Isian awal form tagihan rutin (panel "recurring"); null = daftar. */
  recurringDraft: RecurringDraft | null;
  /** Tempat yang disorot saat peta jajan dibuka (kunci titik `n:<nama>`), mis. dari klik kios. */
  jajanFocus: string | null;
  /** Kios yang sedang disorot kursor (labelnya melebar menampilkan nama). */
  hoverKiosk: string | null;

  hydrate: (snapshot: Snapshot) => void;
  setPanel: (panel: Panel) => void;
  openGoal: (goalId: number | null) => void;
  openWallet: (walletId: number | null) => void;
  setTime: (time: TimeOfDay) => void;
  toggleUi: (key: "showLabels" | "hideMoney" | "freeze" | "reduceFx") => void;
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
  /** Pasang/ganti (rupiah per bulan) atau hapus (null) batas jajan sebuah tempat. */
  setPlaceLimit: (name: string, limit: number | null) => void;
  /** Kirim outbox / tarik perubahan dari perangkat lain (tab kembali dilihat, kembali online). */
  syncNow: () => Promise<void>;
  /** Baca ulang outbox & versi server dari storage (perubahan dari tab lain). */
  reloadSyncCache: () => void;
  /** Buka peta jajan, opsional langsung menyorot satu tempat. */
  openJajan: (placeName?: string | null) => void;
  /** Buka panel 🔁 tagihan rutin, opsional langsung ke form (draft). */
  openRecurring: (draft?: RecurringDraft | null) => void;
  /** Buat (tanpa id) atau ubah aturan rutin. */
  saveRecurring: (input: RecurringInput, id?: number) => Promise<boolean>;
  setRecurringActive: (id: number, active: boolean) => Promise<boolean>;
  deleteRecurring: (id: number) => Promise<boolean>;
  /** Catat / Lewati tagihan di kotak pos. */
  settleBills: (decisions: BillDecision[]) => Promise<boolean>;
  /** Lewati semua tagihan lama satu aturan kecuali yang terbaru. */
  skipOldBills: (recurringId: number) => Promise<boolean>;
  /** Proses jatuh tempo di belakang layar (hari WIB berganti); snapshot hanya diganti kalau ada yang berubah. */
  syncRecurring: () => Promise<void>;
  /** syncRecurring kalau terakhir lebih dari 30 menit lalu (tab kembali dilihat). */
  syncRecurringIfStale: () => void;
  /** Dipanggil Pak Pos saat tiba di kotak pos. */
  deliverMail: () => void;
  setHoverKiosk: (key: string | null) => void;

  tour: TourState;
  /** Setoran & pengeluaran yang berhasil sejak halaman dibuka (untuk tur). */
  tourHits: TourHits;
  /**
   * Sekali per user: lanjutkan tur yang belum selesai, atau mulai otomatis kalau server
   * menilai akun ini baru (lihat isNewVillager di lib/snapshot.ts).
   */
  initTour: (isNew: boolean) => void;
  /**
   * Mulai/lompat ke langkah tertentu (baseline diambil ulang). restart = tur diulang dengan sengaja
   * (tombol ❓): menimpa status selesai/dilewati di akun. Tanpa itu, tur yang sudah ditutup di
   * perangkat lain menang dan tur di tab ini ikut ditutup.
   */
  startTour: (step?: number, restart?: boolean) => void;
  setTourPage: (page: number) => void;
  /** Ambil ulang baseline, mis. setelah pindah bulan. */
  rebaseTour: () => void;
  endTour: (status: Exclude<TourStatus, "active">) => void;
}

const uid = () => Math.random().toString(36).slice(2, 10) || "0";

type SyncView = Pick<
  State,
  "syncBase" | "syncOutbox" | "noSpendDays" | "letterRead" | "placeLimits" | "seen" | "storedTour" | "mailSeen"
>;

/** Data desa kosong tanpa server (landing / desa contoh). */
export const NO_SYNC_VIEW: SyncView = {
  syncBase: LOCAL_SYNC,
  syncOutbox: [],
  noSpendDays: [],
  letterRead: null,
  placeLimits: NO_LIMITS,
  seen: null,
  storedTour: null,
  mailSeen: null
};

/** Jeda kirim ulang setelah gagal: 5 dtk → 10 → 20 → 40 → 60 (lalu menunggu tab dilihat / online lagi). */
const RETRY_MS = [5_000, 10_000, 20_000, 40_000, 60_000];
/** Tarik perubahan perangkat lain paling sering sekali per ini saat tab kembali dilihat. */
const PULL_EVERY_MS = 30_000;
/** Tab kembali dilihat: proses tagihan rutin lagi kalau terakhir lebih lama dari ini. */
const RECURRING_SYNC_EVERY_MS = 30 * 60_000;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

/** "Spotify", "Spotify & Netflix", "Spotify, Netflix & 2 lainnya" */
function titleList(titles: string[]) {
  if (titles.length <= 2) return titles.join(" & ");
  return `${titles.slice(0, 2).join(", ")} & ${titles.length - 2} lainnya`;
}

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
      // ── Data desa yang sinkron antar perangkat (lib/village-sync.ts) ──────────
      let flushTimer: ReturnType<typeof setTimeout> | undefined;
      let inflight = false;
      let again = false;
      let failures = 0;
      let lastContact = 0;
      const today = () => wibDay(Date.now());

      /** Tampilan dari base + outbox; objek lama dipakai ulang kalau isinya sama (hindari render & memo ulang). */
      const syncView = (base: VillageSync, outbox: SyncOp[]): SyncView => {
        const v = deriveView(base, outbox, today());
        const cur = get();
        return {
          syncBase: base,
          syncOutbox: outbox,
          noSpendDays: sameNumberList(cur.noSpendDays, v.noSpend) ? cur.noSpendDays : v.noSpend,
          letterRead: v.letter,
          placeLimits: samePlaceLimits(cur.placeLimits, v.placeLimits) ? cur.placeLimits : v.placeLimits,
          seen: sameSeen(cur.seen, v.seen) ? cur.seen : v.seen,
          storedTour: sameStoredTour(cur.storedTour, v.tour) ? cur.storedTour : v.tour,
          mailSeen: v.mail
        };
      };
      /** Tur yang sedang jalan di tab ini sudah selesai/dilewati di perangkat lain: ikut ditutup. */
      const closeFinishedTour = () => {
        const { tour, storedTour, snapshot } = get();
        if (!tour.active || !snapshot || tour.owner !== tourOwner(snapshot) || !isTerminalTour(storedTour)) return;
        set({ tour: { ...tour, active: false, page: 0, baseline: null } });
        notify("Tur desa sudah ditutup di perangkat lain.");
      };
      const setSync = (base: VillageSync, outbox: SyncOp[]) => {
        set(syncView(base, outbox));
        closeFinishedTour();
      };
      const scheduleFlush = (ms: number) => {
        clearTimeout(flushTimer);
        flushTimer = setTimeout(() => void flush(), ms);
      };
      /** Setelah base/outbox berganti: kirim yang tersisa kalau server siap. */
      const afterSync = () => {
        closeFinishedTour();
        if (get().syncOutbox.length && get().syncBase.available) scheduleFlush(0);
      };

      /** Data desa milik pemilik snapshot ini, mulai dari server (atau salinan terakhir kalau tabelnya belum ada). */
      const freshSync = (snapshot: Snapshot): SyncView => {
        if (isDemoSnapshot(snapshot)) return NO_SYNC_VIEW;
        const owner = tourOwner(snapshot);
        const outbox = prepareOutbox(owner, uid(), today());
        let base = snapshot.sync;
        if (base.available) {
          updateSyncCache(owner, today(), (c) => ({ ...c, base }));
        } else {
          // Migrasi tepira belum jalan (atau sempat dibatalkan): pakai salinan terakhir dari server.
          const cached = readSyncCache(owner, today()).base;
          if (cached) base = { ...cached, available: false };
        }
        return syncView(base, outbox);
      };
      /** Sync yang ikut di snapshot hasil aksi: diterima kalau tidak lebih lama dari yang sudah ada. */
      const incomingSync = (sync: VillageSync): Partial<SyncView> => {
        const cur = get().syncBase;
        if (!sync.available) return cur.available ? syncView({ ...cur, available: false }, get().syncOutbox) : {};
        const next = newerSync(cur, sync);
        return next === cur ? {} : syncView(next, get().syncOutbox);
      };

      /** Satu perubahan data desa: tampil seketika, tersimpan di outbox, dikirim sebentar lagi. */
      const enqueue = (input: SyncOpInput) => {
        const s = get().snapshot;
        if (!s || isDemoSnapshot(s)) return; // desa contoh TIDAK PERNAH menulis
        const op = { ...input, id: uid() } as SyncOp;
        const cache = updateSyncCache(tourOwner(s), today(), (c) => ({ ...c, outbox: [...c.outbox, op] }));
        setSync(get().syncBase, cache.outbox); // sinkron: efek LetterPanel tidak berulang
        if (get().syncBase.available) scheduleFlush(300); // gabungkan klik beruntun
      };

      const flush = async (): Promise<void> => {
        clearTimeout(flushTimer);
        const s = get().snapshot;
        if (!s || isDemoSnapshot(s)) return;
        if (inflight) {
          again = true;
          return;
        }
        const owner = tourOwner(s);
        // Termasuk op dari tab lain (terkirim dua kali tidak apa-apa: semua op idempoten).
        const ops = readSyncCache(owner, today()).outbox.slice(0, MAX_OPS_PER_CALL);
        inflight = true;
        let retryIn = 0;
        try {
          const res = await actions.syncVillage(owner, ops); // ops kosong = tarik saja
          lastContact = Date.now();
          const now = get().snapshot;
          if (!now || isDemoSnapshot(now) || tourOwner(now) !== owner) return; // akun berganti selama request
          if (!res.ok) {
            if (res.code === "error") throw new Error(res.message);
            // "missing": tabel belum ada, tetap jalan lokal (outbox disimpan sampai server siap).
            // "owner": sesi milik akun lain; op tetap di outbox sampai akun ini login lagi.
            again = false;
            const base = get().syncBase;
            if (res.code === "missing" && base.available) setSync({ ...base, available: false }, get().syncOutbox);
            return;
          }
          failures = 0;
          const sent = new Set(ops.map((o) => o.id));
          // Satu tulis: base baru + op terkonfirmasi dibuang, tab lain menerima keduanya sekaligus.
          const cache = updateSyncCache(owner, today(), (c) => ({
            base: res.sync,
            outbox: c.outbox.filter((o) => !sent.has(o.id))
          }));
          setSync(newerSync(get().syncBase, res.sync), cache.outbox);
          if (cache.outbox.length) again = true; // lebih dari MAX_OPS_PER_CALL, atau op baru selama request
        } catch {
          failures += 1;
          if (failures === 1 && ops.length) notify("Belum tersambung. Perubahan disimpan di perangkat ini dulu, nanti dikirim.");
          retryIn = failures <= RETRY_MS.length ? RETRY_MS[failures - 1] : 0;
          again = false;
        } finally {
          inflight = false;
          if (again) {
            again = false;
            scheduleFlush(0);
          } else if (retryIn) {
            scheduleFlush(retryIn);
          }
        }
      };

      /**
       * Urutan hasil: aksi yang ditekan user (mutate) menaikkan seq. Hasil syncRecurring di belakang
       * layar dibuang kalau sementara itu ada aksi lain atau bulan sudah berganti.
       */
      let seq = 0;
      let recurringInflight = false;
      let lastRecurringSync = 0;
      let mailTimer: ReturnType<typeof setTimeout> | undefined;

      const apply = (result: ActionResult) => {
        if (result.ok) {
          const prev = get().snapshot;
          // Akun berganti di tab lain lalu tab ini memuat ulang data: ambil data desa milik akun baru.
          const owner = tourOwner(result.snapshot);
          const switched = prev !== null && !isDemoSnapshot(prev) && tourOwner(prev) !== owner;
          lastContact = Date.now();
          set({
            snapshot: result.snapshot,
            loading: false,
            error: null,
            ...(switched ? freshSync(result.snapshot) : incomingSync(result.snapshot.sync))
          });
          afterSync();
          celebrateSoon();
          lastRecurringSync = Date.now();
          if (result.notice) notify(result.notice);
          // Setelah pesan aksinya sempat terbaca.
          clearTimeout(mailTimer);
          mailTimer = setTimeout(announceMail, 2600);
          return true;
        }
        fail(result.message);
        return false;
      };
      const mutate = async (fn: () => Promise<ActionResult>) => {
        seq += 1;
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
      const walkTo = (x: number, z: number, kind: VillagerTarget["kind"], yaw?: number) =>
        set((s) => ({ villagerTarget: { x, z, kind, yaw, nonce: (s.villagerTarget?.nonce ?? 0) + 1 } }));

      /**
       * Rayakan warga baru & bangunan level yang baru terbuka, sekali per user: yang sudah dirayakan
       * tersimpan di akun (seen), jadi tidak dirayakan ulang di perangkat lain. Pertama kali (belum
       * ada catatan) hanya mencatat diam-diam.
       */
      const celebrate = () => {
        const s = get().snapshot;
        if (!s || isDemoSnapshot(s)) return;
        const villagers = computeStreak(s.activityDays, get().noSpendDays, wibDay(Date.now())).villagers;
        const level = levelFor(villageXp(s.totals.totalSaved, s.totals.contributionCount));
        const seen = get().seen;
        if (!seen) {
          enqueue({ t: "seen", villagers, level });
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
          enqueue({ t: "seen", villagers: Math.max(villagers, seen.villagers), level: Math.max(level, seen.level) });
        }
      };
      /** Ditunda sebentar supaya pesan aksinya ("setoran tercatat" dst.) sempat terbaca dulu. */
      const celebrateSoon = () => setTimeout(celebrate, 1600);

      /**
       * Pak Pos mengumumkan kiriman baru (tagihan di kotak pos, catatan otomatis), sekali per akun:
       * id tertinggi yang sudah diumumkan tersimpan di akun (mailSeen). Pesan tanpa nominal; toast
       * nominal di kotak pos ikut mode sembunyikan angka.
       */
      const announceMail = () => {
        const s = get().snapshot;
        if (!s || isDemoSnapshot(s) || !s.recurring.available) return;
        const marker = get().mailSeen;
        const fresh = newMail(s.recurring, marker, Date.now());
        if (fresh.maxId > (marker ?? 0)) enqueue({ t: "mail", occ: fresh.maxId });
        if (!fresh.bills.length && !fresh.autos.length) return;
        const rules = new Map(s.recurring.rules.map((r) => [r.id, r]));
        const titles = [...new Set(fresh.autos.map((a) => rules.get(a.recurringId)?.title ?? "Tagihan rutin"))];
        const parts: string[] = [];
        if (titles.length) parts.push(`🔁 ${titleList(titles)} sudah dicatat otomatis.`);
        if (fresh.bills.length) parts.push(`📮 Pak Pos mengantar ${fresh.bills.length} tagihan. Buka kotak pos untuk mencatat.`);
        notify(parts.join(" "));
        const spent = fresh.autos.filter((a) => rules.get(a.recurringId)?.kind !== "saving").reduce((sum, a) => sum + a.amount, 0);
        const saved = fresh.autos.filter((a) => rules.get(a.recurringId)?.kind === "saving").reduce((sum, a) => sum + a.amount, 0);
        if (spent) pushToast({ x: MAILBOX.x, z: MAILBOX.z, y: 2.8, text: `-${formatCompact(spent)}`, sub: "🔁 otomatis", tone: "spend" });
        if (saved) pushToast({ x: MAILBOX.x, z: MAILBOX.z, y: spent ? 3.6 : 2.8, text: `+${formatCompact(saved)}`, sub: "🔁 setoran otomatis", tone: "save" });
        // Pak Pos berjalan dari dermaga; tanpa animasi kalau sistem minta kurangi gerakan, tur jalan, atau layar penuh.
        const walk = !prefersReducedMotion() && !get().tour.active && !isFullscreenPanel(get().panel);
        const nonce = (get().postman?.nonce ?? 0) + 1;
        set({ postman: { nonce }, mailDelivered: !walk });
        // Jaga-jaga (mis. WebGL tidak jalan): amplop tetap muncul.
        if (walk) setTimeout(() => get().postman?.nonce === nonce && set({ mailDelivered: true }), 25_000);
      };

      /** Goal yang baru tercapai karena setoran rutin (otomatis / dari kotak pos): rayakan seperti setor biasa. */
      const celebrateGoals = (before: Snapshot | null, after: Snapshot | null) => {
        if (!before || !after) return;
        const prev = new Map(before.goals.map((g) => [g.id, g.progress]));
        const done = after.goals.find((g) => (prev.get(g.id) ?? 1) < 1 && g.progress >= 1);
        if (!done) return;
        set({ celebrateGoalId: done.id });
        notify(`🎉 Goal "${done.title}" tercapai! Bangunannya selesai.`);
        setTimeout(() => set({ celebrateGoalId: null }), 6000);
      };

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
        ...NO_SYNC_VIEW,
        jajanFocus: null,
        hoverKiosk: null,
        postman: null,
        mailDelivered: true,
        recurringDraft: null,
        tour: IDLE_TOUR,
        tourHits: NO_HITS,

        hydrate: (snapshot) => {
          const unlockedBefore =
            typeof window !== "undefined" && sessionStorage.getItem("tepira_village_unlocked") === "true";
          lastContact = Date.now();
          // Data desa dari server ikut di snapshot halaman (tanpa kedipan lampu kosong); data v1 di
          // browser ini diimpor sekali lewat outbox sebelum celebrate & initTour membacanya.
          set({
            snapshot,
            unlocked: snapshot.pinRequired ? unlockedBefore : true,
            postman: null,
            mailDelivered: true,
            ...freshSync(snapshot)
          });
          afterSync();
          // Halaman baru saja memproses tagihan rutin di server.
          lastRecurringSync = Date.now();
          // Warga/bangunan yang bertambah sejak kunjungan terakhir (mis. mencatat lewat tepira.id).
          setTimeout(celebrate, 900);
          // Kiriman Pak Pos sejak kunjungan terakhir, setelah pesan perayaan sempat terbaca.
          clearTimeout(mailTimer);
          mailTimer = setTimeout(announceMail, 2400);
        },
        // Fokus tempat & draft form hanya berlaku untuk satu kali buka.
        setPanel: (panel) => set({ panel, jajanFocus: null, recurringDraft: null }),
        openRecurring: (draft) => set({ panel: "recurring", recurringDraft: draft ?? null, jajanFocus: null }),
        deliverMail: () => set({ mailDelivered: true }),
        saveRecurring: async (input, id) => {
          const ok = await mutate(() =>
            id ? actions.updateRecurring(id, input, period()) : actions.createRecurring(input, period())
          );
          if (ok) set({ recurringDraft: null });
          return ok;
        },
        setRecurringActive: async (id, active) => mutate(() => actions.setRecurringStatus(id, active, period())),
        deleteRecurring: async (id) => {
          const ok = await mutate(() => actions.deleteRecurring(id, period()));
          if (ok) set({ recurringDraft: null });
          return ok;
        },
        settleBills: async (decisions) => {
          const before = get().snapshot;
          const ok = await mutate(() => actions.settleRecurringBills(decisions, period()));
          const after = get().snapshot;
          if (!ok || !before || !after) return ok;
          // Yang benar-benar tercatat = tagihan "Catat" yang sudah tidak menunggu lagi.
          const stillPending = new Set(after.recurring.bills.map((b) => b.id));
          const kinds = new Map(before.recurring.rules.map((r) => [r.id, r.kind]));
          let spent = 0;
          let saved = 0;
          for (const d of decisions) {
            const bill = before.recurring.bills.find((b) => b.id === d.id);
            if (!bill || d.action !== "pay" || stillPending.has(d.id)) continue;
            if (kinds.get(bill.recurringId) === "saving") saved += d.amount ?? bill.amount;
            else spent += d.amount ?? bill.amount;
          }
          if (spent || saved) {
            walkTo(MAILBOX_FRONT.x, MAILBOX_FRONT.z, saved && !spent ? "save" : "spend", MAILBOX_FRONT.yaw);
            if (spent) pushToast({ x: MAILBOX.x, z: MAILBOX.z, y: 2.8, text: `-${formatCompact(spent)}`, sub: "📮 tagihan", tone: "spend" });
            if (saved) pushToast({ x: MAILBOX.x, z: MAILBOX.z, y: spent ? 3.6 : 2.8, text: `+${formatCompact(saved)}`, sub: "📮 setoran rutin", tone: "save" });
          }
          celebrateGoals(before, after);
          return ok;
        },
        skipOldBills: async (recurringId) => mutate(() => actions.skipOldRecurringBills(recurringId, period())),
        syncRecurring: async () => {
          const s = get().snapshot;
          if (!s || isDemoSnapshot(s) || get().loading || recurringInflight) return;
          const my = seq;
          const p = s.period;
          recurringInflight = true;
          lastRecurringSync = Date.now();
          try {
            const res = await actions.syncRecurring(p);
            if (!res.ok || !("snapshot" in res)) return;
            const cur = get().snapshot;
            // Ada aksi lain, bulan berganti, atau akun berganti selama request: hasil ini sudah basi.
            if (seq !== my || get().loading || !cur || isDemoSnapshot(cur)) return;
            if (cur.period.month !== p.month || cur.period.year !== p.year || tourOwner(cur) !== tourOwner(res.snapshot)) return;
            apply(res);
            celebrateGoals(cur, res.snapshot);
          } catch {
            // diam saja: dicoba lagi saat hari berganti / tab dilihat lagi, dan tiap aksi memproses juga
          } finally {
            recurringInflight = false;
          }
        },
        syncRecurringIfStale: () => {
          if (Date.now() - lastRecurringSync > RECURRING_SYNC_EVERY_MS) void get().syncRecurring();
        },
        openJajan: (placeName) =>
          set({ panel: "jajan", jajanFocus: placeName ? spotKeyFor(placeName) : null, hoverKiosk: null }),
        setHoverKiosk: (hoverKiosk) => set({ hoverKiosk }),
        setPlaceLimit: (name, limit) => {
          const s = get().snapshot;
          const clean = cleanPlaceName(name);
          if (!s || isDemoSnapshot(s) || !normalizePlaceName(clean)) return;
          const value = limit === null || !(limit > 0) ? null : Math.round(limit);
          if (value !== null && value > MAX_LIMIT) return;
          if (clean.length > MAX_PLACE_NAME) {
            fail("Nama tempat terlalu panjang untuk diberi batas jajan.");
            return;
          }
          const current = get().placeLimits;
          const next = withPlaceLimit(current, clean, value);
          if (next === current) return;
          // Tempat lama tidak pernah digusur diam-diam (dulu yang paling lama dibuang).
          if (Object.keys(next).length > MAX_PLACE_LIMITS) {
            fail(`Batas jajan maksimal ${MAX_PLACE_LIMITS} tempat. Hapus salah satu dulu, ya.`);
            return;
          }
          // Satu op per tempat: perubahan tempat lain dari perangkat lain tidak ikut tertimpa.
          enqueue({ t: "limit", name: clean, limit: value });
          // Tanpa nominal: pesan ini tampil juga saat angka disembunyikan.
          notify(value ? `🎯 Batas jajan ${clean} disimpan.` : `Batas jajan ${clean} dihapus.`);
        },
        syncNow: async () => {
          const s = get().snapshot;
          if (!s || isDemoSnapshot(s)) return;
          const pending = get().syncOutbox.length > 0 && get().syncBase.available;
          if (pending || Date.now() - lastContact > PULL_EVERY_MS) await flush();
        },
        reloadSyncCache: () => {
          const s = get().snapshot;
          if (!s || isDemoSnapshot(s)) return;
          const c = readSyncCache(tourOwner(s), today());
          setSync(c.base ? newerSync(get().syncBase, c.base) : get().syncBase, c.outbox);
        },
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
          const placeName = input.place?.name?.trim() || null;
          const placeKey = placeName ? normalizePlaceName(placeName) : null;
          const spentBefore = placeKey ? (spendByPlaceName(get().snapshot?.expenses ?? []).get(placeKey)?.total ?? 0) : 0;
          const ok = await mutate(() => actions.addExpense(input, period()));
          if (ok) {
            set((s) => ({ tourHits: { ...s.tourHits, spend: s.tourHits.spend + 1 } }));
            const snap = get().snapshot;
            const kiosk = snap && placeKey ? placedKiosks(snap, get().placeLimits).find((k) => k.key === placeKey) : undefined;
            if (kiosk) {
              // Jajan di tempat langganan: si penabung mampir ke kiosnya, bukan ke warung.
              const front = kioskFront(kiosk.spot);
              walkTo(front.x, front.z, "spend", front.yaw);
              pushToast({
                x: kiosk.spot.x,
                z: kiosk.spot.z,
                y: 3.2,
                text: `-${formatCompact(input.amount)}`,
                sub: kiosk.name,
                tone: "spend"
              });
            } else {
              walkTo(WARUNG.x - 1.2, WARUNG.z + 3.4, "spend");
              pushToast({
                x: WARUNG.x,
                z: WARUNG.z,
                y: 4.4,
                text: `-${formatCompact(input.amount)}`,
                sub: input.category || "Pengeluaran",
                tone: "spend"
              });
            }
            // Naik level batas (aman → hampir → lewat) karena catatan ini: kabari tanpa menyebut nominal.
            const limit = snap && placeKey ? findPlaceLimit(get().placeLimits, placeKey) : null;
            const spentAfter = snap && placeKey ? (spendByPlaceName(snap.expenses).get(placeKey)?.total ?? 0) : 0;
            const before = limit ? limitStatus(spentBefore, limit.limit) : null;
            const after = limit ? limitStatus(spentAfter, limit.limit) : null;
            if (snap && limit && after && before && LIMIT_RANK[after.level] > LIMIT_RANK[before.level]) {
              notify(
                `Pengeluaran tercatat. ${LIMIT_EMOJI[after.level]} ${limit.name} ${LIMIT_WORD[after.level]} ${periodWord(snap.period)}.`
              );
            } else {
              notify("Pengeluaran tercatat & saldo dompet diperbarui.");
            }
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
          if (!s || isDemoSnapshot(s)) return;
          const now = today();
          const had = get().noSpendDays.includes(day);
          // Membatalkan selalu boleh; menandai hanya dalam batas mundur (server memakai aturan yang sama).
          if (!had && !noSpendAllowed(day, now)) return;
          // Nilai mutlak, bukan "toggle": aman terkirim dua kali.
          enqueue({ t: "nospend", day, on: !had });
          if (had) return;
          const lamp = LAMP_POSTS[6 - (now - day)];
          if (lamp) pushToast({ x: lamp[0], z: lamp[1], y: 3.4, text: "💡", sub: "Nol pengeluaran", tone: "info" });
          notify(day === now ? "🌙 Hari ini ditandai nol pengeluaran. Lampunya menyala!" : "🌙 Hari itu ditandai nol pengeluaran.");
          celebrateSoon();
        },
        markLetterRead: (key) => {
          const s = get().snapshot;
          if (!s || isDemoSnapshot(s) || get().letterRead === key) return;
          enqueue({ t: "letter", key });
        },

        initTour: (isNew) => {
          const s = get().snapshot;
          if (!s) return;
          const owner = tourOwner(s);
          if (get().tour.owner === owner) return;
          const stored = get().storedTour;
          const hits = get().tourHits;
          if (stored?.status === "active") {
            set({ tour: { owner, active: true, step: stored.step, page: 0, baseline: captureBaseline(s, hits) } });
          } else if (!stored && isNew) {
            set({ tour: { owner, active: true, step: 0, page: 0, baseline: captureBaseline(s, hits) } });
            // Tanpa restart: kalau perangkat lain sudah menutup tur, yang itu menang.
            enqueue({ t: "tour", status: "active", step: 0, restart: false });
          } else {
            set({ tour: { ...IDLE_TOUR, owner } });
          }
        },
        startTour: (step = 0, restart = false) => {
          const s = get().snapshot;
          if (!s) return;
          const owner = tourOwner(s);
          const next = clampTourStep(step);
          set({ tour: { owner, active: true, step: next, page: 0, baseline: captureBaseline(s, get().tourHits) } });
          enqueue({ t: "tour", status: "active", step: next, restart });
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
          set({ tour: { ...tour, active: false, page: 0, baseline: null } });
          // Status pasti (selesai/dilewati) selalu menimpa; hanya untuk pemilik tur ini.
          if (snapshot && (tour.owner ?? tourOwner(snapshot)) === tourOwner(snapshot)) {
            enqueue({ t: "tour", status, step: tour.step, restart: false });
          }
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
// Preferensi (ui) tetap per perangkat; data desa ikut tab lain lewat salinan sinkron (daily.ts).
// Store ini juga dimuat di landing: syncNow & reloadSyncCache diam saja tanpa snapshot / untuk demo.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    try {
      if (e.storageArea !== window.localStorage) return;
      if (e.key === "tepira-village-ui" || e.key === null) void useVillage.persist.rehydrate();
      if (e.key === null || e.key.startsWith(SYNC_PREFIX)) useVillage.getState().reloadSyncCache();
    } catch {
      // storage diblokir: preferensi cukup diingat di tab ini
    }
  });
  // Kembali ke tab / kembali online: kirim yang tertunda dan tarik perubahan dari perangkat lain.
  const wake = () => {
    if (document.visibilityState !== "visible") return;
    void useVillage.getState().syncNow();
    useVillage.getState().syncRecurringIfStale();
  };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake);
}

/** Apakah angka boleh ditampilkan sekarang. */
export function useMoneyVisible() {
  return useVillage((s) => s.unlocked && !s.ui.hideMoney);
}
