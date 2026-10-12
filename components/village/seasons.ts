"use client";

import { useSyncExternalStore } from "react";
import type { SeasonKey } from "@/lib/season";
import { HALL } from "./layout";

/**
 * Tampilan pulau per musim (lib/season.ts). Hanya warna & skala yang diubah saat render: tata letak
 * dekorasi, cuaca (langit, laut, cahaya), dan warna tanda bahaya (rumput liar, kavling terbengkalai,
 * tanaman kios layu) tidak tersentuh. Kemarau condong ke jerami, bukan zaitun, supaya tetap beda
 * dari rumput liar.
 */
export interface SeasonLook {
  /** rumput pulau & pulau kedua (bawaan "#a6dc78") */
  grass: string;
  /** arah campuran warna mahkota pohon, cemara, dan semak */
  leafTo: string;
  /** porsi campuran untuk pohon & cemara (0..1) */
  leafMix: number;
  /** porsi campuran untuk semak */
  bushMix: number;
  /** skala air kolam; cincin pasir tetap */
  pondScale: number;
  /** 1 = semua bunga mekar, 2 = separuhnya */
  flowerKeep: 1 | 2;
  /** tiap pohon ke-N meranggas (daun jingga, mahkota mengecil) */
  bareEvery?: number;
  /** tiap pohon ke-3 berbuah mangga */
  fruit?: boolean;
  /** yang terlihat di pulau, untuk panel jurnal */
  island: string;
}

export const SEASON_LOOK: Record<SeasonKey, SeasonLook> = {
  hujan: {
    grass: "#96d670",
    leafTo: "#3fae5a",
    leafMix: 0.2,
    bushMix: 0.2,
    pondScale: 1.08,
    flowerKeep: 1,
    island:
      "Rumput paling hijau, kolam penuh, genangan di jalan setapak. Gerimis saat berawan atau malam, pelangi saat cerah, kunang-kunang saat senja dan malam."
  },
  panen: {
    grass: "#b6da78",
    leafTo: "#e8c35a",
    leafMix: 0.12,
    bushMix: 0.1,
    pondScale: 1,
    flowerKeep: 1,
    island: "Rumput agak keemasan, tumpukan jerami dan karung beras di samping Balai Desa, kupu-kupu saat siang."
  },
  kemarau: {
    grass: "#bfd67c",
    leafTo: "#e8c35a",
    leafMix: 0.3,
    bushMix: 0.25,
    pondScale: 0.72,
    flowerKeep: 2,
    bareEvery: 4,
    island: "Rumput dan daun menguning, sebagian pohon meranggas, bunga tinggal separuh, kolam surut, layangan di langit."
  },
  mangga: {
    grass: "#a6dc78",
    leafTo: "#c9d65a",
    leafMix: 0.12,
    bushMix: 0.08,
    pondScale: 1,
    flowerKeep: 1,
    fruit: true,
    island: "Pohon berbuah mangga, daun berguguran, layangan masih terbang, sekeranjang mangga di samping Balai Desa."
  }
};

/** Daun pohon yang meranggas di musim kemarau. */
export const BARE_LEAF = "#e6a35a";
export const MANGO = "#ffb347";

/**
 * Pojok musim di pelataran Balai Desa (kanan balai dari sudut pandang awal): di dalam pelataran
 * (radius 4,4) dan area bebas dekorasi balai (5,6), jauh dari jalan setapak, kios, lampu, & kotak pos.
 * Diklik = buka jurnal.
 */
export const SEASON_SPOT = { x: HALL.x + 3.4, z: HALL.z - 1.2 };

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const subscribeReducedMotion = (onChange: () => void) => {
  const mq = window.matchMedia?.(REDUCED_MOTION);
  mq?.addEventListener("change", onChange);
  return () => mq?.removeEventListener("change", onChange);
};

/** Pengaturan sistem "kurangi gerakan": partikel musim yang bergerak tidak ditampilkan. */
export const useReducedMotion = () =>
  useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia?.(REDUCED_MOTION).matches ?? false,
    () => false
  );
