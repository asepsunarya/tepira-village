import { roundCoord } from "@/lib/places";

/**
 * Lokasi untuk peta jajan, semuanya di browser:
 * - posisi sekarang dari GPS/browser (perlu izin; hanya jalan di https atau localhost);
 * - nama tempat & pencarian dari Nominatim (OpenStreetMap). Aturan pakainya: maks. 1 permintaan per
 *   detik dan tanpa autocomplete, jadi hanya dipanggil saat user menekan tombol / Enter.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export function currentPosition(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Browser ini tidak bisa membaca lokasi."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: roundCoord(pos.coords.latitude), lng: roundCoord(pos.coords.longitude) }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Izin lokasi ditolak. Aktifkan di pengaturan browser untuk situs ini."
              : "Lokasi belum ketemu. Coba lagi di tempat terbuka."
          )
        ),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 }
    );
  });
}

interface NominatimPlace {
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string>;
}

/** Nama paling berguna untuk catatan: nama tempat, kalau tidak ada "Jalan …, kelurahan". */
function placeLabel(p: NominatimPlace) {
  if (p.name) return p.name;
  const a = p.address ?? {};
  const area = a.neighbourhood ?? a.suburb ?? a.village ?? a.city_district ?? a.town ?? a.city;
  const label = [a.road, area].filter(Boolean).join(", ");
  return label || p.display_name?.split(",")[0]?.trim() || "";
}

async function nominatim<T>(path: string, params: Record<string, string>): Promise<T | null> {
  try {
    const qs = new URLSearchParams({ format: "jsonv2", "accept-language": "id", ...params });
    const res = await fetch(`${NOMINATIM}/${path}?${qs}`, { headers: { Accept: "application/json" } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Nama tempat di titik itu (warung, toko, atau jalan terdekat); null kalau tidak ada / gagal. */
export async function reverseGeocode(point: GeoPoint): Promise<string | null> {
  const data = await nominatim<NominatimPlace>("reverse", { lat: String(point.lat), lon: String(point.lng), zoom: "18", addressdetails: "1" });
  return data ? placeLabel(data) || null : null;
}

export interface FoundPlace extends GeoPoint {
  name: string;
  detail: string;
}

/** Cari tempat di Indonesia, diutamakan yang dekat `near` (kalau ada). */
export async function searchPlaces(query: string, near: GeoPoint | null): Promise<FoundPlace[]> {
  const params: Record<string, string> = { q: query, countrycodes: "id", limit: "5", addressdetails: "1" };
  if (near) {
    const d = 0.25; // ±25 km, hanya menggeser urutan hasil (bounded=0)
    params.viewbox = `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`;
  }
  const data = await nominatim<NominatimPlace[]>("search", params);
  return (data ?? [])
    .filter((p) => p.lat && p.lon)
    .map((p) => ({
      name: placeLabel(p),
      detail: (p.display_name ?? "").split(",").slice(1, 4).join(",").trim(),
      lat: roundCoord(Number(p.lat)),
      lng: roundCoord(Number(p.lon))
    }));
}
