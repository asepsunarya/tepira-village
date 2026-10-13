import { wibWeekStart, type InsightView } from "@/lib/game";
import {
  MAX_OUTBOX,
  compactOutbox,
  importFromLegacy,
  legacyFingerprint,
  newerSync,
  parseSync,
  parseSyncOps,
  type LegacyRaw,
  type SyncOp,
  type VillageSync
} from "@/lib/village-sync";

/**
 * Salinan data desa per user di browser. Sumber kebenarannya database (lib/village-state.ts, lewat
 * snapshot.sync dan server action syncVillage); localStorage hanya:
 * - outbox: op yang belum dikonfirmasi server (offline, gagal, atau tabelnya belum ada), bertahan
 *   walau halaman dimuat ulang;
 * - base: versi server terakhir, supaya tab lain ikut ter-update tanpa bertanya ke server;
 * - tanda impor sekali per perangkat dari kunci v1 (sebelum data desa pindah ke database).
 * Kalau storage diblokir, cukup diingat selama sesi.
 */

const memory = new Map<string, string>();

function readRaw(key: string): string | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    // storage diblokir: pakai ingatan sesi
  }
  return raw ?? memory.get(key) ?? null;
}

function writeRaw(key: string, raw: string) {
  memory.set(key, raw);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    // tidak apa-apa, tetap diingat selama sesi
  }
}

/** Kunci v1 dibaca apa adanya, tanpa ingatan sesi (yang ingin diimpor hanya isi storage lama). */
function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

// ── Surat mingguan ───────────────────────────────────────────────────────────
/** Satu surat per insight tepira; kalau belum ada insight, satu pratinjau per minggu (mulai Senin WIB). */
export function letterKey(insight: InsightView | null, today: number) {
  return insight ? `i${insight.id}` : `w${wibWeekStart(today)}`;
}

// ── Salinan sinkron (outbox + versi server terakhir) ─────────────────────────
export const SYNC_PREFIX = "tepira-village-sync:v2:";

export interface SyncCache {
  outbox: SyncOp[];
  base: VillageSync | null;
}

export function readSyncCache(owner: string, today: number): SyncCache {
  const raw = readRaw(SYNC_PREFIX + owner);
  if (!raw) return { outbox: [], base: null };
  try {
    const v = JSON.parse(raw) as { outbox?: unknown; base?: unknown } | null;
    // Storage bisa diubah tangan: op & data dibersihkan dengan validator yang sama dengan server.
    return { outbox: parseSyncOps(v?.outbox ?? [], MAX_OUTBOX), base: parseSync(v?.base, today) };
  } catch {
    return { outbox: [], base: null };
  }
}

/**
 * Baca-ubah-tulis dalam satu tugas (satu setItem: tab lain menerima outbox & base sekaligus).
 * Outbox selalu diringkas; base yang tersimpan hanya diganti versi yang lebih baru.
 */
export function updateSyncCache(owner: string, today: number, fn: (c: SyncCache) => SyncCache): SyncCache {
  const cur = readSyncCache(owner, today);
  const next = fn(cur);
  const kept: SyncCache = {
    outbox: compactOutbox(next.outbox),
    base: next.base ? newerSync(cur.base, next.base) : cur.base
  };
  writeRaw(SYNC_PREFIX + owner, JSON.stringify(kept));
  return kept;
}

// ── Impor sekali per perangkat dari kunci v1 ─────────────────────────────────
// Kunci v1 sengaja TIDAK dihapus rilis ini (kalau desa versi lama dipakai lagi, datanya masih ada).
const LEGACY_KEYS = {
  nospend: "tepira-village-nospend:v1:",
  seen: "tepira-village-seen:v1:",
  letter: "tepira-village-letter:v1:",
  limits: "tepira-village-placelimits:v1:",
  tour: "tepira-village-tour:v1:"
} as const;

/** Isinya = sidik jari kunci v1 saat diimpor: tab lama yang menulis lagi sesudahnya memicu impor ulang (aman, digabung). */
const IMPORT_FLAG_PREFIX = "tepira-village-synced:v1:";

export function readLegacy(owner: string): LegacyRaw {
  return {
    nospend: readStored(LEGACY_KEYS.nospend + owner),
    seen: readStored(LEGACY_KEYS.seen + owner),
    letter: readStored(LEGACY_KEYS.letter + owner),
    limits: readStored(LEGACY_KEYS.limits + owner),
    tour: readStored(LEGACY_KEYS.tour + owner)
  };
}

/**
 * Outbox pemilik ini. Pertama kali (atau kalau isi kunci v1 berubah sejak impor terakhir), data v1
 * ditambahkan sebagai satu op "import": langsung tampil di desa, dan terkirim seperti op lain begitu
 * server siap.
 */
export function prepareOutbox(owner: string, newId: string, today: number): SyncOp[] {
  const raw = readLegacy(owner);
  const fp = legacyFingerprint(raw);
  if (!fp || readRaw(IMPORT_FLAG_PREFIX + owner) === fp) return readSyncCache(owner, today).outbox;
  const op = importFromLegacy(raw, newId, today);
  const cache = updateSyncCache(owner, today, (c) => ({ ...c, outbox: op ? [...c.outbox, op] : c.outbox }));
  writeRaw(IMPORT_FLAG_PREFIX + owner, fp);
  return cache.outbox;
}
