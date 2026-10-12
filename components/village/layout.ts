import type { UnlockKey } from "@/lib/game";
import type { TimeOfDay, TimePreset } from "./types";

/**
 * Tata letak pulau. Semua posisi dalam satuan dunia (x ke kanan, z ke bawah
 * layar pada sudut isometrik default).
 */

/** Permukaan laut; pulau menjulang dari sini sampai y = 0. */
export const SEA_Y = -3.2;

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

/**
 * Lampu jalan streak, satu per hari: indeks 0 = 6 hari lalu, indeks 6 = hari ini (depan Balai
 * Desa), urut mengikuti jalan setapak. Semua di samping jalan dan sudah dicek tidak menabrak
 * kavling mana pun (termasuk yang belum terpakai), balai, warung, dompet, maupun kolam.
 */
export const LAMP_POSTS: [number, number][] = [
  [7.57, 6.71],
  [13.67, 0.49],
  [6.3, -5.89],
  [1.27, -6.95],
  [-9.65, -0.42],
  [-3.15, 5.62],
  [1.3, 3.6]
];

/** Kotak pos surat mingguan, di pelataran Balai Desa. */
export const MAILBOX = { x: -3.3, z: 0.6, rot: 0.5 };

// Bangunan yang terbuka per level (VILLAGE_UNLOCKS). Area-areanya sudah dikosongkan dari dekorasi
// sejak awal supaya pohon tidak bergeser saat level naik.
/** Dermaga di pantai barat daya; sumbu z lokal menjorok ke laut. */
export const DOCK = { x: -10.4, z: 15.4, rot: Math.atan2(-0.6, 0.8) };
/** Tiga lapak menghadap kamera, di antara warung dan kavling selatan. */
export const MARKET = { x: 11.8, z: 13.5, rot: Math.PI / 4 };
/** Mercusuar di tanjung timur. */
export const LIGHTHOUSE = { x: 23.6, z: -1.2 };
/** Pulau kedua di selatan, disambung jembatan dari pantai (z0 di darat, z1 di pulau kecil). */
export const ISLET = { x: 3.4, z: 26.6, r: 4.2 };
export const BRIDGE = { x: 3, z0: 16.6, z1: 22.8 };
/** Balon udara berputar pelan di atas desa. */
export const BALLOON = { x: -2, y: 13, z: 2, r: 6 };

/**
 * Kios tempat langganan (lib/kiosks.ts): K1–K5 berjajar di "jalan jajan" dekat warung, K6–K8 di
 * sudut barat laut antara jalan setapak dan kolam. Depan kios (+z lokal) menghadap jalan setapak,
 * semuanya 2,2 dari garis tengah jalan dan bebas dari kavling goal, peti dompet, lampu, & bangunan level.
 * Urutan = nomor slot. Dekorasi selalu menjauhi kedelapan titik ini (Decor.tsx).
 */
export const KIOSK_SPOTS: { x: number; z: number; rot: number }[] = [
  { x: 5.44, z: 1.76, rot: -0.46 },
  { x: 7.87, z: 3.11, rot: -0.55 },
  { x: 10.69, z: 1.93, rot: 1.8 },
  { x: 9.85, z: -0.39, rot: 2.05 },
  { x: 8.44, z: -2.51, rot: 2.25 },
  { x: -7.43, z: -5.42, rot: 0.52 },
  { x: -9.56, z: -3.26, rot: 1.01 },
  { x: -11.24, z: 1.48, rot: 1.5 }
];

/** Slot 7 bertabrakan dengan kavling goal ke-14 dan seterusnya. */
export const kioskBlockedSlots = (goalCount: number) => (goalCount >= 14 ? [7] : []);

/** Titik berdiri di depan kios (di jalan setapak) dan arah hadap ke kios. */
export function kioskFront(spot: { x: number; z: number; rot: number }, distance = 1.9) {
  return { x: spot.x + distance * Math.sin(spot.rot), z: spot.z + distance * Math.cos(spot.rot), yaw: spot.rot + Math.PI };
}

/** Titik di darat untuk papan "segera dibangun" dan toast saat terbuka. */
export const UNLOCK_SPOTS: Record<UnlockKey, { x: number; z: number }> = {
  dermaga: { x: DOCK.x + 0.3, z: DOCK.z - 0.6 },
  pasar: { x: MARKET.x, z: MARKET.z },
  mercusuar: { x: LIGHTHOUSE.x - 0.6, z: LIGHTHOUSE.z },
  pulau: { x: BRIDGE.x, z: BRIDGE.z0 - 0.8 },
  balon: { x: HALL.x, z: HALL.z }
};

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
