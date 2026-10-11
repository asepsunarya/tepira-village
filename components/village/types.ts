export type Panel = "goals" | "save" | "spend" | "wallets" | "salary" | "log" | "month" | null;
export type TimeOfDay = "auto" | "day" | "cloudy" | "sunset" | "night";

export interface WorldToast {
  id: string;
  x: number;
  z: number;
  y: number;
  text: string;
  sub?: string;
  tone: "save" | "spend" | "info";
  createdAt: number;
}

export interface VillagerTarget {
  x: number;
  z: number;
  /** aksi apa yang membawa penduduk ke sana (untuk animasi saat tiba). */
  kind: "save" | "spend" | "idle";
  nonce: number;
}

export interface TimePreset {
  bg: string;
  sea: string;
  ambient: number;
  ambientColor: string;
  sky: string;
  ground: string;
  sun: number;
  sunColor: string;
  sunPos: [number, number, number];
  windows: boolean;
}
