"use client";

import { useEffect, useRef } from "react";
import type { FeatureCollection } from "geojson";
import { LngLatBounds, Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { formatCompact } from "@/lib/format";
import { categoryColor, type PlaceSpend } from "@/lib/places";

// MapLibre v6 mencari file worker-nya relatif ke import.meta.url, yang di bundle Next berupa path
// file:// sehingga gagal. Webpack menyalin worker (satu file mandiri) sebagai aset dan memberi URL-nya.
setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());

/** Peta dasar gratis tanpa API key: OpenFreeMap (data © OpenStreetMap). */
const STYLE = "https://tiles.openfreemap.org/styles/positron";
/** Kalau belum ada titik sama sekali: seluruh Indonesia. */
const INDONESIA = { center: [118, -2.5] as [number, number], zoom: 3.4 };

export interface MapFocus {
  key: string;
  /** naik tiap klik, supaya memilih tempat yang sama dua kali tetap terbang ke sana */
  n: number;
}

function toGeoJSON(spots: readonly PlaceSpend[], hideMoney: boolean): FeatureCollection {
  const max = Math.max(1, ...spots.map((s) => s.total));
  return {
    type: "FeatureCollection",
    features: spots.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
      properties: {
        key: s.key,
        color: categoryColor(s.topCategory),
        // Ukuran ikut nominal (akar, supaya tempat kecil tetap terlihat); sama rata saat angka disembunyikan.
        r: hideMoney ? 9 : 6 + 14 * Math.sqrt(s.total / max)
      }
    }))
  };
}

/** Isi popup dirakit lewat DOM (bukan HTML) karena nama tempat adalah ketikan user. */
function popupNode(spot: PlaceSpend, hideMoney: boolean) {
  const root = document.createElement("div");
  root.className = "jajan-popup";
  const title = document.createElement("b");
  title.textContent = spot.name ?? "Titik tanpa nama";
  const detail = document.createElement("span");
  detail.textContent = `${spot.count}× · ${hideMoney ? "••••" : formatCompact(spot.total)}`;
  root.append(title, detail);
  if (spot.topCategory) {
    const category = document.createElement("small");
    category.textContent = spot.topCategory.replace(/\s*\(.*\)$/, "");
    root.append(category);
  }
  return root;
}

function openPopup(map: MapLibreMap, holder: { current: Popup | null }, spot: PlaceSpend, hideMoney: boolean) {
  holder.current?.remove();
  holder.current = new Popup({ offset: 14, closeButton: false, maxWidth: "240px" })
    .setLngLat([spot.lng, spot.lat])
    .setDOMContent(popupNode(spot, hideMoney))
    .addTo(map);
}

function fitSpots(map: MapLibreMap, spots: readonly PlaceSpend[]) {
  if (!spots.length) return;
  if (spots.length === 1) {
    map.easeTo({ center: [spots[0].lng, spots[0].lat], zoom: 15, duration: 600 });
    return;
  }
  const bounds = new LngLatBounds();
  for (const s of spots) bounds.extend([s.lng, s.lat]);
  map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 600 });
}

/** Peta jajan: satu lingkaran per tempat, warna = kategori terbesar, ukuran = nominal. */
export default function JajanMap({
  spots,
  focus,
  hideMoney,
  home
}: {
  spots: readonly PlaceSpend[];
  focus: MapFocus | null;
  hideMoney: boolean;
  /** pusat awal kalau bulan ini kosong, mis. tempat yang paling sering dicatat */
  home: { lat: number; lng: number } | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loaded = useRef(false);
  const popup = useRef<Popup | null>(null);
  const latest = useRef({ spots, hideMoney });
  latest.current = { spots, hideMoney };
  const homeRef = useRef(home);

  // Peta dibuat sekali; data dan fokus diperbarui lewat efek di bawah.
  useEffect(() => {
    const container = el.current!;
    const start = homeRef.current;
    const map = new MapLibreMap({
      container,
      style: STYLE,
      center: start ? [start.lng, start.lat] : INDONESIA.center,
      zoom: start ? 12 : INDONESIA.zoom,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("spots", { type: "geojson", data: toGeoJSON(latest.current.spots, latest.current.hideMoney) });
      map.addLayer({
        id: "spots-halo",
        type: "circle",
        source: "spots",
        paint: { "circle-radius": ["+", ["get", "r"], 5], "circle-color": ["get", "color"], "circle-opacity": 0.22 }
      });
      map.addLayer({
        id: "spots",
        type: "circle",
        source: "spots",
        paint: {
          "circle-radius": ["get", "r"],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2
        }
      });
      map.on("click", "spots", (e) => {
        const key = e.features?.[0]?.properties?.key;
        const spot = latest.current.spots.find((s) => s.key === key);
        if (spot) openPopup(map, popup, spot, latest.current.hideMoney);
      });
      map.on("mouseenter", "spots", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "spots", () => {
        map.getCanvas().style.cursor = "";
      });
      loaded.current = true;
      fitSpots(map, latest.current.spots);
    });
    // Panel bisa berubah ukuran (animasi masuk, layar diputar): kanvas peta ikut.
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container);
    mapRef.current = map;
    return () => {
      resize.disconnect();
      // Popup ikut terhapus bersama peta.
      map.remove();
      mapRef.current = null;
      loaded.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    (map.getSource("spots") as GeoJSONSource | undefined)?.setData(toGeoJSON(spots, hideMoney));
    popup.current?.remove();
  }, [spots, hideMoney]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && loaded.current) fitSpots(map, spots);
  }, [spots]);

  useEffect(() => {
    const map = mapRef.current;
    const spot = focus && latest.current.spots.find((s) => s.key === focus.key);
    if (!map || !loaded.current || !spot) return;
    openPopup(map, popup, spot, latest.current.hideMoney);
    map.flyTo({ center: [spot.lng, spot.lat], zoom: Math.max(map.getZoom(), 15), duration: 800 });
  }, [focus]);

  return <div ref={el} className="jajan-map" />;
}
