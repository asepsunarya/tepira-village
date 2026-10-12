import type { KnownPlace } from "@/lib/game";
import { findPlaceLimit, limitStatus, type LimitStatus, type PlaceLimits } from "@/lib/place-limits";
import { normalizePlaceName, type PlaceMonthSpend } from "@/lib/places";

/**
 * "Kios tempat langganan": tempat yang sering didatangi (setahun terakhir) jadi kios kecil di
 * pulau. Kios dipilih dari data tahunan supaya tidak muncul-hilang saat ganti bulan; keramaian dan
 * status batasnya mengikuti bulan yang dilihat.
 */

/** Minimal dicatat sekian kali setahun (atau punya batas jajan) untuk dapat kios. */
export const KIOSK_MIN_COUNT = 2;
export const MAX_KIOSKS = 8;

/** Hash FNV-1a 32-bit: stabil di semua browser, dasar slot kios. */
export function fnv1a(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export type Busyness = 0 | 1 | 2 | 3;

/** Keramaian dari jumlah kunjungan (hari berbeda) di bulan yang dilihat. */
export const kioskBusyness = (visits: number): Busyness => (visits >= 6 ? 3 : visits >= 3 ? 2 : visits >= 1 ? 1 : 0);

/**
 * Slot tiap kios dari hash kuncinya (bukan peringkat), supaya kios tidak pindah tempat saat
 * urutan berubah. Bentrok: geser ke slot bebas berikutnya. `keys` diproses sesuai urutannya
 * (prioritas dari pickKiosks), jadi tempat yang paling sering didatangi tetap di slot hash-nya dan
 * tempat baru yang mengalah kalau bentrok.
 */
export function assignKioskSlots(keys: readonly string[], slotCount: number, blocked: readonly number[] = []) {
  const taken = new Set(blocked.filter((b) => b >= 0 && b < slotCount));
  const out = new Map<string, number>();
  for (const key of new Set(keys)) {
    if (taken.size >= slotCount) break;
    let slot = fnv1a(key) % slotCount;
    while (taken.has(slot)) slot = (slot + 1) % slotCount;
    taken.add(slot);
    out.set(key, slot);
  }
  return out;
}

export interface Kiosk {
  /** normalizePlaceName(nama) */
  key: string;
  name: string;
  /** titik terbaru di peta; null kalau tempat ini hanya dikenal dari batas jajan */
  point: { lat: number; lng: number } | null;
  /** jumlah catatan setahun terakhir */
  yearCount: number;
  monthTotal: number;
  monthVisits: number;
  topCategory: string | null;
  limit: number | null;
  status: LimitStatus | null;
  busy: Busyness;
  slot: number;
}

/**
 * Pilih kios: tempat dengan ≥ KIOSK_MIN_COUNT catatan setahun ditambah tempat yang punya batas.
 * Prioritas: punya batas, lalu paling sering, lalu nama. Diambil sebanyak slot yang tersedia.
 */
export function pickKiosks(
  places: readonly KnownPlace[],
  month: ReadonlyMap<string, PlaceMonthSpend>,
  limits: PlaceLimits,
  slotCount = MAX_KIOSKS,
  blocked: readonly number[] = []
): Kiosk[] {
  const candidates = new Map<string, { name: string; point: Kiosk["point"]; yearCount: number }>();
  for (const p of places) {
    const key = normalizePlaceName(p.name);
    if (!key || p.count < KIOSK_MIN_COUNT || candidates.has(key)) continue;
    candidates.set(key, { name: p.name, point: { lat: p.lat, lng: p.lng }, yearCount: p.count });
  }
  for (const [key, l] of Object.entries(limits)) {
    if (candidates.has(key)) continue;
    const known = places.find((p) => normalizePlaceName(p.name) === key);
    candidates.set(key, {
      name: known?.name ?? l.name,
      point: known ? { lat: known.lat, lng: known.lng } : null,
      yearCount: known?.count ?? 0
    });
  }
  const room = Math.max(0, slotCount - new Set(blocked.filter((b) => b >= 0 && b < slotCount)).size);
  const chosen = [...candidates.entries()]
    .sort(
      ([ka, a], [kb, b]) =>
        Number(kb in limits) - Number(ka in limits) || b.yearCount - a.yearCount || (ka < kb ? -1 : ka > kb ? 1 : 0)
    )
    .slice(0, room);
  const slots = assignKioskSlots(
    chosen.map(([k]) => k),
    slotCount,
    blocked
  );
  return chosen.map(([key, c]) => {
    const m = month.get(key);
    const limit = findPlaceLimit(limits, key)?.limit ?? null;
    return {
      key,
      name: c.name,
      point: c.point,
      yearCount: c.yearCount,
      monthTotal: m?.total ?? 0,
      monthVisits: m?.visits ?? 0,
      topCategory: m?.topCategory ?? null,
      limit,
      status: limit ? limitStatus(m?.total ?? 0, limit) : null,
      busy: kioskBusyness(m?.visits ?? 0),
      slot: slots.get(key) ?? 0
    };
  });
}
