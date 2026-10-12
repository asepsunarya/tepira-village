"use client";

import { useId, useState } from "react";
import type { KnownPlace } from "@/lib/game";
import { normalizePlaceName } from "@/lib/places";
import { currentPosition, reverseGeocode, searchPlaces, type FoundPlace } from "../geo";

/** Isian tempat di form pengeluaran. `from` hanya mengatur perilaku form, tidak disimpan. */
export interface PlaceValue {
  name: string;
  lat: number | null;
  lng: number | null;
  /** asal titiknya: GPS (titik tetap walau namanya diubah) atau tempat lain (dilepas kalau namanya diganti) */
  from?: "gps" | "known" | "search";
}

export const NO_PLACE: PlaceValue = { name: "", lat: null, lng: null };

/** Bentuk untuk server action; null = tanpa lokasi. */
export function placeInput(v: PlaceValue) {
  const name = v.name.trim();
  return name || v.lat !== null ? { name: name || null, lat: v.lat, lng: v.lng } : null;
}

export default function PlacePicker({
  value,
  onChange,
  places
}: {
  value: PlaceValue;
  onChange: (v: PlaceValue) => void;
  places: readonly KnownPlace[];
}) {
  const id = useId();
  const [busy, setBusy] = useState<"gps" | "search" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<FoundPlace[]>([]);
  const hasPoint = value.lat !== null && value.lng !== null;

  const reset = () => {
    setResults([]);
    setMessage(null);
  };

  const typeName = (name: string) => {
    reset();
    const known = places.find((p) => normalizePlaceName(p.name) === normalizePlaceName(name));
    if (known) onChange({ name, lat: known.lat, lng: known.lng, from: "known" });
    // Titik GPS tetap (cuma memberi nama); titik dari tempat lain dilepas karena tempatnya berganti.
    else if (value.from === "gps") onChange({ ...value, name });
    else onChange({ name, lat: null, lng: null });
  };

  const locate = async () => {
    reset();
    setBusy("gps");
    try {
      const point = await currentPosition();
      const name = value.name.trim() || (await reverseGeocode(point)) || "";
      onChange({ name, lat: point.lat, lng: point.lng, from: "gps" });
      if (!name) setMessage("Titiknya tersimpan. Beri nama tempatnya kalau mau.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Lokasi gagal dibaca.");
    } finally {
      setBusy(null);
    }
  };

  const search = async () => {
    const q = value.name.trim();
    if (q.length < 3) {
      setMessage("Tulis minimal 3 huruf, lalu Enter untuk mencari.");
      return;
    }
    reset();
    setBusy("search");
    const near = hasPoint ? { lat: value.lat!, lng: value.lng! } : places[0] ? { lat: places[0].lat, lng: places[0].lng } : null;
    const found = await searchPlaces(q, near);
    setBusy(null);
    setResults(found);
    if (!found.length) setMessage("Tidak ketemu di peta. Namanya tetap disimpan tanpa titik.");
  };

  const pick = (p: { name: string; lat: number; lng: number }, from: "known" | "search") => {
    reset();
    onChange({ name: p.name, lat: p.lat, lng: p.lng, from });
  };

  const suggestions = places.slice(0, 5);

  return (
    <div className="place-picker">
      <label htmlFor={id}>📍 Tempat (opsional)</label>
      <div className="place-row">
        <input
          id={id}
          value={value.name}
          onChange={(e) => typeName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            void search();
          }}
          placeholder="Warung, toko, SPBU…"
          autoComplete="off"
          enterKeyHint="search"
        />
        <button type="button" className="icon-btn" onClick={() => void locate()} disabled={busy !== null} title="Pakai lokasi sekarang">
          {busy === "gps" ? "…" : "📍"}
        </button>
        {(value.name || hasPoint) && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              reset();
              onChange(NO_PLACE);
            }}
            title="Hapus tempat"
          >
            ✕
          </button>
        )}
      </div>
      {hasPoint ? (
        <small className="place-status ok">🗺️ Masuk peta jajan{value.from === "gps" ? " · titik dari lokasimu sekarang" : ""}</small>
      ) : value.name.trim() ? (
        <small className="place-status">Belum ada titik: tekan 📍 kalau sedang di sana, atau Enter untuk mencari.</small>
      ) : null}
      {busy === "search" && <small className="muted">Mencari…</small>}
      {message && <small className="place-status warn">{message}</small>}
      {results.length > 0 && (
        <div className="place-results">
          {results.map((r, i) => (
            <button type="button" key={`${r.lat},${r.lng},${i}`} className="place-result" onClick={() => pick(r, "search")}>
              <b>{r.name}</b>
              {r.detail && <small className="muted block">{r.detail}</small>}
            </button>
          ))}
        </div>
      )}
      {!value.name && !hasPoint && suggestions.length > 0 && (
        <div className="chips">
          {suggestions.map((p) => (
            <button type="button" key={p.name} className="pill" onClick={() => pick(p, "known")}>
              📍 {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
