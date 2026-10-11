import type { Snapshot } from "@/lib/game";

/**
 * Progres "tur desa" untuk pengguna baru. Disimpan per user di browser saja
 * (tidak ada tabel/kolom baru); kalau storage diblokir, cukup diingat selama sesi.
 */
export type TourStatus = "active" | "done" | "skipped";

export interface StoredTour {
  status: TourStatus;
  step: number;
}

/** Langkah 0 = sambutan, 1..TOUR_LAST_STEP = langkah bernomor (progres "n/8"). */
export const TOUR_LAST_STEP = 8;

export const clampTourStep = (step: number) =>
  Math.max(0, Math.min(TOUR_LAST_STEP, Number.isFinite(step) ? Math.floor(step) : 0));

/** Pemilik progres: email user (snapshot demo tidak pernah sampai ke sini). */
export const tourOwner = (s: Snapshot) => s.user.email ?? "anon";

export const tourKey = (owner: string) => `tepira-village-tour:v1:${owner}`;

const memory = new Map<string, StoredTour>();

export function readTour(owner: string): StoredTour | null {
  const key = tourKey(owner);
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const v = JSON.parse(raw) as Partial<StoredTour> | null;
      if (v && (v.status === "active" || v.status === "done" || v.status === "skipped") && typeof v.step === "number") {
        return { status: v.status, step: clampTourStep(v.step) };
      }
    }
  } catch {
    // storage diblokir / JSON rusak: pakai ingatan sesi
  }
  return memory.get(key) ?? null;
}

export function writeTour(owner: string, value: StoredTour) {
  const key = tourKey(owner);
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // tidak apa-apa, tur tetap jalan tanpa storage
  }
}

export const periodKey = (s: Snapshot) => `${s.period.year}-${s.period.month}`;

const maxId = (ids: number[]) => ids.reduce((m, id) => (id > m ? id : m), 0);

export function salarySig(s: Snapshot) {
  const v = s.salary;
  if (!v) return "";
  return [v.id, v.amount, v.savingsAllocation, ...v.allocations.map((a) => `${a.category}=${a.amount}`)].join("|");
}

/**
 * Aksi yang berhasil sejak halaman dibuka (dihitung store dari hasil server action).
 * Setoran & pengeluaran dideteksi dari sini, bukan dari snapshot: pengeluaran bisa
 * bertanggal di bulan lain, dan riwayat setoran di snapshot dipotong 30 terbaru.
 */
export interface TourHits {
  spend: number;
  save: number;
  /** goal tujuan setoran terakhir yang berhasil */
  saveGoalId: number | null;
}

export const NO_HITS: TourHits = { spend: 0, save: 0, saveGoalId: null };

/**
 * Angka pembanding saat sebuah langkah dimulai. Id di tepira autoincrement,
 * jadi "ada data baru" = id terbesar bertambah (hapus lalu tambah tetap terdeteksi).
 */
export interface TourBaseline {
  /** bulan yang sedang dilihat saat baseline diambil */
  period: string;
  /** bulan saat langkah dimulai, untuk memberi tahu kalau user pindah bulan */
  start: { month: number; year: number };
  walletMax: number;
  goalMax: number;
  contributionCount: number;
  /** jumlah aksi berhasil saat langkah dimulai (tidak berubah saat pindah bulan) */
  hits: { spend: number; save: number };
  salarySig: string;
}

export function captureBaseline(s: Snapshot, hits: TourHits, prev?: TourBaseline | null): TourBaseline {
  return {
    period: periodKey(s),
    start: prev?.start ?? { month: s.period.month, year: s.period.year },
    walletMax: maxId(s.wallets.map((w) => w.id)),
    goalMax: maxId(s.goals.map((g) => g.id)),
    contributionCount: s.totals.contributionCount,
    hits: prev?.hits ?? { spend: hits.spend, save: hits.save },
    salarySig: salarySig(s)
  };
}

export const newestWallet = (s: Snapshot, b: TourBaseline) => s.wallets.find((w) => w.id > b.walletMax) ?? null;
export const newestGoal = (s: Snapshot, b: TourBaseline) => s.goals.find((g) => g.id > b.goalMax) ?? null;
/** Goal yang barusan disetori (dari store), bukan hasil menebak dari daftar setoran. */
export const savedGoal = (s: Snapshot, h: TourHits) => s.goals.find((g) => g.id === h.saveGoalId) ?? null;
