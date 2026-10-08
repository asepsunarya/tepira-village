import type { TimeOfDay, TimePreset } from "./types";

/**
 * Tata letak pulau. Semua posisi dalam satuan dunia (x ke kanan, z ke bawah
 * layar pada sudut isometrik default).
 */

export const POND = { x: -13, z: -9, rx: 4.2, rz: 3.1 };

/** Balai desa: rumah si penabung, menampilkan level & skor kesehatan. */
export const HALL = { x: 0, z: -2 };

/** Warung: tempat pengeluaran "terjadi". */
export const WARUNG = { x: 13, z: 7 };

/** Deretan peti dompet di sisi utara pulau. */
export const WALLET_ROW = { x0: -10, z: -13.5, gap: 3.3, max: 7 };

/** Kavling untuk bangunan goal, urut stabil berdasarkan createdAt. */
export const GOAL_PLOTS: { x: number; z: number; rot: number }[] = [
  { x: -9, z: 6, rot: 0.2 },
  { x: -1, z: 10, rot: 0 },
  { x: 7, z: 13, rot: -0.3 },
  { x: -17, z: -1, rot: 0.6 },
  { x: 16, z: -3, rot: -0.5 },
  { x: -15, z: 11, rot: 0.4 },
  { x: 11, z: -9, rot: -0.2 },
  { x: -3, z: -8, rot: 0.1 },
  { x: 20, z: 5, rot: -0.7 },
  { x: -21, z: 5, rot: 0.8 }
];

export function goalPlot(index: number) {
  const base = GOAL_PLOTS[index % GOAL_PLOTS.length];
  const ring = Math.floor(index / GOAL_PLOTS.length);
  // Kalau goal lebih banyak dari kavling, geser sedikit supaya tidak menumpuk.
  return { x: base.x + ring * 1.6, z: base.z + ring * 1.6, rot: base.rot };
}

export function walletSpot(index: number) {
  const i = Math.min(index, WALLET_ROW.max - 1);
  const extra = Math.max(0, index - (WALLET_ROW.max - 1));
  return { x: WALLET_ROW.x0 + i * WALLET_ROW.gap + extra * 0.9, z: WALLET_ROW.z + extra * 1.4 };
}

/** Jalur setapak melingkar yang menghubungkan balai desa, warung dan kavling. */
export const PATH_POINTS: [number, number][] = [
  [0, 1.5],
  [5, 4],
  [10, 6.5],
  [13, 4.5],
  [12, -1],
  [8, -6],
  [2, -8.5],
  [-2, -5],
  [-7, -3],
  [-9, 2.5],
  [-5, 6],
  [0, 7],
  [3, 4],
  [0, 1.5]
];

export const TILE_COLORS = ["#fde2b8", "#f9d3c4", "#ffe9c9", "#f4d9d0"];

export const TIME_PRESETS: Record<Exclude<TimeOfDay, "auto">, TimePreset> = {
  day: {
    bg: "#cfe9f7",
    sea: "#9ad4ee",
    ambient: 0.75,
    ambientColor: "#ffffff",
    sky: "#dff3ff",
    ground: "#c8e2b0",
    sun: 1.5,
    sunColor: "#fff6e5",
    sunPos: [30, 48, 20],
    windows: false
  },
  cloudy: {
    bg: "#dfe3ea",
    sea: "#b8c6d6",
    ambient: 0.85,
    ambientColor: "#eef2f8",
    sky: "#e8ecf2",
    ground: "#c2cdb8",
    sun: 0.8,
    sunColor: "#f1f3f7",
    sunPos: [20, 50, 30],
    windows: false
  },
  sunset: {
    bg: "#f6c7b0",
    sea: "#e39a8e",
    ambient: 0.6,
    ambientColor: "#ffd9c4",
    sky: "#ffd1b8",
    ground: "#b89a86",
    sun: 1.3,
    sunColor: "#ffb482",
    sunPos: [-40, 18, 24],
    windows: true
  },
  night: {
    bg: "#2c2f55",
    sea: "#27305a",
    ambient: 0.35,
    ambientColor: "#aab4ff",
    sky: "#5a67a8",
    ground: "#303a5c",
    sun: 0.45,
    sunColor: "#b9c7ff",
    sunPos: [-20, 40, -20],
    windows: true
  }
};

/** Cuaca otomatis mengikuti skor kesehatan bulan ini. */
export function autoTime(healthScore: number): Exclude<TimeOfDay, "auto"> {
  if (healthScore >= 70) return "day";
  if (healthScore >= 55) return "cloudy";
  return "sunset";
}

export const GOAL_PALETTE = [
  { body: "#fff1c9", roof: "#f3b562" },
  { body: "#ffe1ea", roof: "#f28cb4" },
  { body: "#dff5ff", roof: "#7cc3e8" },
  { body: "#e8f8dc", roof: "#8fcf7e" },
  { body: "#efe3ff", roof: "#b391f0" },
  { body: "#ffe6d6", roof: "#f0a06a" },
  { body: "#e0f5ef", roof: "#6cc8ad" },
  { body: "#fff8dd", roof: "#e9c46a" }
];

export function goalPalette(index: number) {
  return GOAL_PALETTE[index % GOAL_PALETTE.length];
}
