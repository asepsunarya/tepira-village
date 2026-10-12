export type Panel =
  | "goals"
  | "save"
  | "spend"
  | "wallets"
  | "salary"
  | "log"
  | "month"
  | "village"
  | "letter"
  | "jajan"
  | "aliran"
  | null;

/** Panel yang tampil layar penuh menutupi desa (scene berhenti merender, HUD dibuat inert). */
export const isFullscreenPanel = (panel: Panel) => panel === "jajan" || panel === "aliran";
export type TimeOfDay = "auto" | "day" | "cloudy" | "sunset" | "night";
/** Suasana peta jajan: "desa" = ikut cuaca desa saat ini. */
export type MapThemeSetting = "desa" | "siang" | "senja" | "malam";

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
  /** arah hadap saat tiba (rotation-y); kosong = menghadap bangunan di utara (π) */
  yaw?: number;
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
