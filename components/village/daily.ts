import { ACTIVITY_WINDOW_DAYS, wibWeekStart, type InsightView } from "@/lib/game";

/**
 * Data loop harian yang sengaja TIDAK disimpan di database (repo ini tidak punya migrasi):
 * hari "nol pengeluaran", surat yang sudah dibuka, dan warga/level yang sudah dirayakan.
 * Disimpan per user di browser; kalau storage diblokir, cukup diingat selama sesi.
 */

const memory = new Map<string, string>();

function read<T>(key: string, parse: (value: unknown) => T | null): T | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    // storage diblokir: pakai ingatan sesi
  }
  raw ??= memory.get(key) ?? null;
  if (!raw) return null;
  try {
    return parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    // tidak apa-apa, tetap diingat selama sesi
  }
}

const isDay = (v: unknown): v is number => Number.isInteger(v);

// ── Hari "nol pengeluaran" (hari WIB) ────────────────────────────────────────
const noSpendKey = (owner: string) => `tepira-village-nospend:v1:${owner}`;

export function readNoSpend(owner: string): number[] {
  return read(noSpendKey(owner), (v) => (Array.isArray(v) ? v.filter(isDay) : null)) ?? [];
}

/** Simpan urut, tanpa duplikat, dan buang yang sudah di luar jendela aktivitas. */
export function writeNoSpend(owner: string, days: number[], today: number) {
  const kept = [...new Set(days)].filter((d) => d > today - ACTIVITY_WINDOW_DAYS && d <= today).sort((a, b) => a - b);
  write(noSpendKey(owner), kept);
  return kept;
}

// ── Warga & level yang sudah dirayakan ───────────────────────────────────────
export interface Seen {
  villagers: number;
  level: number;
}

const seenKey = (owner: string) => `tepira-village-seen:v1:${owner}`;

export function readSeen(owner: string): Seen | null {
  return read(seenKey(owner), (v) => {
    const s = v as Partial<Seen> | null;
    return s && isDay(s.villagers) && isDay(s.level) ? { villagers: s.villagers, level: s.level } : null;
  });
}

export function writeSeen(owner: string, seen: Seen) {
  write(seenKey(owner), seen);
}

// ── Surat mingguan ───────────────────────────────────────────────────────────
const letterReadKey = (owner: string) => `tepira-village-letter:v1:${owner}`;

/** Satu surat per insight tepira; kalau belum ada insight, satu pratinjau per minggu (mulai Senin WIB). */
export function letterKey(insight: InsightView | null, today: number) {
  return insight ? `i${insight.id}` : `w${wibWeekStart(today)}`;
}

export function readLetter(owner: string): string | null {
  return read(letterReadKey(owner), (v) => (typeof v === "string" ? v : null));
}

export function writeLetter(owner: string, key: string) {
  write(letterReadKey(owner), key);
}
