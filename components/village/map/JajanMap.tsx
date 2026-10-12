"use client";

import { useEffect, useRef, useState } from "react";
import { LngLatBounds, Map as MapLibreMap, Marker, Popup, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { formatCompact } from "@/lib/format";
import { LIMIT_EMOJI, LIMIT_RANK, LIMIT_WORD, type LimitLevel } from "@/lib/place-limits";
import { categoryColor, categoryIcon, groupNearby, shortCategory, type PlaceSpend } from "@/lib/places";
import type { LimitView } from "../usePlaces";
import { currentPosition } from "../geo";
import type { MapThemeSetting } from "../types";
import { PALETTES, applyGameTheme, buildGameStyle, type MapTheme } from "./gameStyle";

// MapLibre v6 mencari file worker-nya relatif ke import.meta.url, yang di bundle Next berupa path
// file:// sehingga gagal. Webpack menyalin worker (satu file mandiri) sebagai aset dan memberi URL-nya.
setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());

/** Kalau belum ada titik sama sekali: seluruh Indonesia. */
const INDONESIA = { center: [118, -2.5] as [number, number], zoom: 3.4 };
/**
 * Penanda yang lebih dekat dari ini (px) digabung, kira-kira selebar satu penanda. Jarak tegak
 * dihitung lebih ketat karena penanda lebih tinggi daripada lebarnya (ada label nominal).
 */
const GROUP_RADIUS = 56;
const GROUP_SQUASH_Y = 0.72;
/** Gedung baru timbul mulai zoom 15 (lihat gameStyle). */
const ZOOM_3D = 15.6;
/** Di atas zoom ini penanda gabungan yang masih menumpuk dibuka sebagai daftar, bukan di-zoom lagi. */
const ZOOM_MAX_SPLIT = 17.5;

export const THEME_OPTIONS: { key: MapThemeSetting; icon: string; label: string }[] = [
  { key: "desa", icon: "🏝️", label: "Ikut cuaca desa" },
  { key: "siang", icon: "☀️", label: "Siang" },
  { key: "senja", icon: "🌇", label: "Senja" },
  { key: "malam", icon: "🌙", label: "Malam" }
];
const THEME_ICON: Record<MapTheme, string> = { siang: "☀️", senja: "🌇", malam: "🌙" };

export interface MapFocus {
  key: string;
  /** naik tiap klik, supaya memilih tempat yang sama dua kali tetap terbang ke sana */
  n: number;
  /** titik cadangan kalau tempatnya tidak punya penanda bulan ini (mis. dibuka dari kios) */
  lat?: number;
  lng?: number;
}

type LimitMap = ReadonlyMap<string, LimitView>;
const NO_LIMIT_VIEWS: LimitMap = new Map();

/** Level batas terburuk di sebuah kelompok penanda (null = tidak ada yang punya batas). */
function worstLevel(members: readonly PlaceSpend[], limits: LimitMap): LimitLevel | null {
  let worst: LimitLevel | null = null;
  for (const m of members) {
    const level = limits.get(m.key)?.level;
    if (level && (!worst || LIMIT_RANK[level] > LIMIT_RANK[worst])) worst = level;
  }
  return worst;
}

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface PinGroup {
  /** tempat terbesar di kelompok: penanda berdiri di titiknya dan memakai ikon kategorinya */
  lead: PlaceSpend;
  members: PlaceSpend[];
  total: number;
  count: number;
}

const money = (value: number, hide: boolean) => (hide ? "••••" : formatCompact(value));

/** Penanda ala peta game: lingkaran putih bercincin warna kategori, ikon, jumlah catatan, nominal. */
function pinElement(g: PinGroup, hideMoney: boolean, selected: boolean, level: LimitLevel | null) {
  const root = document.createElement("button");
  root.type = "button";
  root.className = `jm-pin${g.members.length > 1 ? " group" : ""}${selected ? " on" : ""}${
    level === "warn" || level === "over" ? ` lim-${level}` : ""
  }`;
  root.style.setProperty("--ring", categoryColor(g.lead.topCategory));
  root.title =
    g.members.length > 1 ? `${g.members.length} tempat berdekatan` : (g.lead.name ?? "Titik tanpa nama");
  const body = document.createElement("span");
  body.className = "jm-pin-body";
  const icon = document.createElement("span");
  icon.className = "jm-pin-icon";
  icon.textContent = categoryIcon(g.lead.topCategory);
  const badge = document.createElement("span");
  badge.className = "jm-pin-badge";
  badge.textContent = String(g.count);
  body.append(icon, badge);
  const amount = document.createElement("span");
  amount.className = "jm-pin-amount";
  amount.textContent = money(g.total, hideMoney);
  root.append(body, amount);
  return root;
}

/** Isi popup dirakit lewat DOM (bukan HTML) karena nama tempat adalah ketikan user. */
function popupNode(spots: readonly PlaceSpend[], hideMoney: boolean, limits: LimitMap) {
  const root = document.createElement("div");
  root.className = "jajan-popup";
  for (const spot of spots) {
    const row = document.createElement("div");
    row.className = "jajan-popup-row";
    const title = document.createElement("b");
    title.textContent = `${categoryIcon(spot.topCategory)} ${spot.name ?? "Titik tanpa nama"}`;
    const detail = document.createElement("span");
    detail.textContent = `${spot.visits}× ke sini · ${spot.count} catatan · ${money(spot.total, hideMoney)}`;
    row.append(title, detail);
    if (spot.topCategory) {
      const category = document.createElement("small");
      category.textContent = shortCategory(spot.topCategory);
      row.append(category);
    }
    const limit = limits.get(spot.key);
    if (limit) {
      const line = document.createElement("span");
      line.className = `jp-limit ${limit.level}`;
      line.textContent = `${LIMIT_EMOJI[limit.level]} ${LIMIT_WORD[limit.level]} · ${money(limit.spent, hideMoney)} dari batas ${money(limit.limit, hideMoney)}`;
      row.append(line);
    }
    root.append(row);
  }
  return root;
}

interface PopupState {
  popup: Popup | null;
  /** tempat terpilih yang ditunjukkan popup; null = daftar penanda gabungan */
  key: string | null;
}

function closePopup(state: PopupState) {
  const p = state.popup;
  state.popup = null;
  state.key = null;
  p?.remove();
}

function openPopup(
  map: MapLibreMap,
  state: PopupState,
  list: readonly PlaceSpend[],
  key: string | null,
  hideMoney: boolean,
  limits: LimitMap,
  onUserClose: () => void
) {
  closePopup(state);
  const p = new Popup({ anchor: "bottom", offset: [0, -30], closeButton: false, maxWidth: "260px", className: "jm-popup" })
    .setLngLat([list[0].lng, list[0].lat])
    .setDOMContent(popupNode(list, hideMoney, limits))
    .addTo(map);
  // Ditutup user (klik peta / penanda lain): beri tahu induk. Penutupan dari kode tidak dihitung.
  p.on("close", () => {
    if (state.popup !== p) return;
    state.popup = null;
    state.key = null;
    onUserClose();
  });
  state.popup = p;
  state.key = key;
}

/**
 * Jarak tepi untuk fitBounds, dijepit ke ruang yang tersisa setelah padding peta (sidebar/lembar):
 * kalau jumlahnya melebihi ukuran peta, MapLibre diam-diam tidak bergerak sama sekali.
 */
function fitPad(map: MapLibreMap, want: number) {
  const box = map.getContainer();
  const { top = 0, right = 0, bottom = 0, left = 0 } = map.getPadding();
  const room = Math.min(box.clientWidth - left - right, box.clientHeight - top - bottom);
  return Math.max(0, Math.min(want, Math.floor(room / 3)));
}

function fitSpots(map: MapLibreMap, spots: readonly PlaceSpend[], duration = 700) {
  if (!spots.length) return;
  if (spots.length === 1) {
    map.easeTo({ center: [spots[0].lng, spots[0].lat], zoom: 15, duration });
    return;
  }
  const bounds = new LngLatBounds();
  for (const s of spots) bounds.extend([s.lng, s.lat]);
  map.fitBounds(bounds, { padding: fitPad(map, 70), maxZoom: 15.5, duration });
}

/**
 * Peta jajan bergaya desa: peta dasar gameStyle + penanda per tempat (yang berdekatan digabung),
 * tombol 3D, suasana, lokasiku, dan lihat semua.
 */
export default function JajanMap({
  spots,
  limits = NO_LIMIT_VIEWS,
  focus,
  selected,
  onSelect,
  hideMoney,
  home,
  theme,
  themeSetting,
  onThemeSetting,
  padding
}: {
  spots: readonly PlaceSpend[];
  /** status batas jajan per kunci titik */
  limits?: LimitMap;
  focus: MapFocus | null;
  selected: string | null;
  onSelect: (key: string | null) => void;
  hideMoney: boolean;
  /** pusat awal kalau bulan ini kosong, mis. tempat yang paling sering dicatat */
  home: { lat: number; lng: number } | null;
  theme: MapTheme;
  themeSetting: MapThemeSetting;
  onThemeSetting: (setting: MapThemeSetting) => void;
  /** bagian peta yang tertutup panel (desktop: sidebar di kiri) */
  padding: MapPadding;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [pitched, setPitched] = useState(false);
  const [menu, setMenu] = useState(false);
  const [locating, setLocating] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const markers = useRef<Marker[]>([]);
  const drawn = useRef("");
  const popup = useRef<PopupState>({ popup: null, key: null });
  const me = useRef<Marker | null>(null);
  const latest = useRef({ spots, limits, hideMoney, selected, onSelect, padding });
  latest.current = { spots, limits, hideMoney, selected, onSelect, padding };
  const initial = useRef({ home, theme });

  /** Susun ulang penanda: kelompokkan per jarak di layar; dilewati kalau hasilnya sama. */
  const draw = useRef(() => {});
  draw.current = () => {
    const map = mapRef.current;
    if (!map) return;
    const { spots: list, limits: lim, hideMoney: hide, selected: sel } = latest.current;
    const points = list.map((s) => {
      const p = map.project([s.lng, s.lat]);
      return { x: p.x, y: p.y * GROUP_SQUASH_Y };
    });
    const groups: PinGroup[] = groupNearby(
      points,
      list.map((s) => s.total),
      GROUP_RADIUS
    ).map((idx) => {
      const members = idx.map((i) => list[i]);
      return {
        lead: members[0],
        members,
        total: members.reduce((sum, m) => sum + m.total, 0),
        count: members.reduce((sum, m) => sum + m.count, 0)
      };
    });
    // Ikut isi yang digambar (nominal, jumlah, kategori, titik), bukan hanya kunci: ganti bulan atau
    // kategori bisa menghasilkan tempat & urutan yang sama dengan angka berbeda.
    const signature = `${hide}|${sel}|${groups
      .map((g) =>
        g.members
          .map((m) => `${m.key}:${m.total}:${m.count}:${m.topCategory}:${m.lat},${m.lng}:${lim.get(m.key)?.level ?? ""}`)
          .join("+")
      )
      .join(",")}`;
    if (signature === drawn.current) return;
    drawn.current = signature;
    for (const m of markers.current) m.remove();
    // Yang terbesar ditambahkan terakhir supaya berada di atas saat bersinggungan.
    markers.current = groups.reverse().map((g) => {
      const isSelected = g.members.some((m) => m.key === sel);
      const node = pinElement(g, hide, isSelected, worstLevel(g.members, lim));
      node.addEventListener("click", (event) => {
        event.stopPropagation();
        if (g.members.length > 1 && map.getZoom() < ZOOM_MAX_SPLIT) {
          const bounds = new LngLatBounds();
          for (const m of g.members) bounds.extend([m.lng, m.lat]);
          map.fitBounds(bounds, { padding: fitPad(map, 90), maxZoom: ZOOM_MAX_SPLIT + 0.5, duration: 700 });
        } else if (g.members.length > 1) {
          // Masih menumpuk di zoom terdekat (mis. satu gedung): tampilkan daftarnya.
          latest.current.onSelect(null);
          openPopup(map, popup.current, g.members, null, hide, lim, () => latest.current.onSelect(null));
        } else {
          latest.current.onSelect(g.lead.key);
        }
      });
      const marker = new Marker({ element: node, anchor: "top", offset: [0, -23] })
        .setLngLat([g.lead.lng, g.lead.lat])
        .addTo(map);
      if (isSelected) marker.getElement().style.zIndex = "3";
      return marker;
    });
  };

  // Peta dibuat sekali; data, suasana, dan fokus diperbarui lewat efek di bawah.
  useEffect(() => {
    const container = el.current!;
    const start = initial.current.home;
    const map = new MapLibreMap({
      container,
      style: buildGameStyle(initial.current.theme),
      center: start ? [start.lng, start.lat] : INDONESIA.center,
      zoom: start ? 12.5 : INDONESIA.zoom,
      maxPitch: 70,
      attributionControl: { compact: true }
    });
    mapRef.current = map;
    map.on("load", () => {
      // Padding dulu, supaya bingkai awal tidak tertutup sidebar.
      map.setPadding(latest.current.padding);
      fitSpots(map, latest.current.spots, 0);
      setReady(true);
    });
    map.on("moveend", () => draw.current());
    map.on("pitchend", () => setPitched(map.getPitch() > 10));
    // Ukuran wadah berubah (layar diputar, sidebar): kanvas ikut.
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container);
    return () => {
      resize.disconnect();
      // Penanda & popup ikut terhapus bersama peta.
      map.remove();
      mapRef.current = null;
      markers.current = [];
      drawn.current = "";
    };
  }, []);

  useEffect(() => {
    if (ready) mapRef.current?.setPadding(padding);
  }, [ready, padding]);

  useEffect(() => {
    if (ready && mapRef.current) applyGameTheme(mapRef.current, theme);
  }, [ready, theme]);

  // Himpunan tempat berganti (bulan, kategori, pencarian): bingkai ulang supaya semuanya terlihat.
  const spotKeys = spots.map((s) => s.key).join("|");
  const firstFit = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (firstFit.current) {
      firstFit.current = false;
      return;
    }
    if (mapRef.current) fitSpots(mapRef.current, latest.current.spots);
  }, [ready, spotKeys]);

  // Popup daftar penanda gabungan berisi salinan data lama: tutup saat tempat atau mode privasi berganti.
  // (Bukan di efek pilihan di bawah, karena daftar itu dibuka tepat saat pilihan dilepas.)
  useEffect(() => {
    if (popup.current.key === null) closePopup(popup.current);
  }, [spots, hideMoney, limits]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    draw.current();
    const spot = selected ? spots.find((s) => s.key === selected) : null;
    if (spot) openPopup(map, popup.current, [spot], spot.key, hideMoney, limits, () => latest.current.onSelect(null));
    // Daftar penanda gabungan (key null) dibiarkan: dibuka tepat saat pilihan dilepas.
    else if (popup.current.key !== null) closePopup(popup.current);
  }, [ready, selected, spots, hideMoney, limits]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focus) return;
    const spot = latest.current.spots.find((s) => s.key === focus.key);
    // Tempat tanpa penanda bulan ini (dibuka dari kios): pakai titik terakhir yang dikenal.
    const at = spot ? { lat: spot.lat, lng: spot.lng } : focus.lat !== undefined && focus.lng !== undefined ? { lat: focus.lat, lng: focus.lng } : null;
    if (!at) return;
    map.flyTo({ center: [at.lng, at.lat], zoom: Math.max(map.getZoom(), 16), duration: 900 });
  }, [ready, focus]);

  const say = (text: string) => {
    setFlash(text);
    window.setTimeout(() => setFlash((t) => (t === text ? null : t)), 3500);
  };

  const toggle3d = () => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getPitch() > 10) map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
    else map.easeTo({ pitch: 58, bearing: -20, zoom: Math.max(map.getZoom(), ZOOM_3D), duration: 900 });
  };

  const locate = async () => {
    const map = mapRef.current;
    if (!map || locating) return;
    setLocating(true);
    try {
      const pos = await currentPosition();
      me.current?.remove();
      const dot = document.createElement("div");
      dot.className = "jm-me";
      dot.title = "Kamu di sini";
      me.current = new Marker({ element: dot }).setLngLat([pos.lng, pos.lat]).addTo(map);
      map.flyTo({ center: [pos.lng, pos.lat], zoom: Math.max(map.getZoom(), 15.5), duration: 900 });
    } catch (e) {
      say(e instanceof Error ? e.message : "Lokasi belum ketemu.");
    } finally {
      setLocating(false);
    }
  };

  const showAll = () => {
    const map = mapRef.current;
    if (!map) return;
    if (latest.current.spots.length) fitSpots(map, latest.current.spots);
    else if (initial.current.home) map.flyTo({ center: [initial.current.home.lng, initial.current.home.lat], zoom: 12.5 });
    else map.flyTo({ center: INDONESIA.center, zoom: INDONESIA.zoom });
  };

  return (
    <div className="jm-wrap" style={{ background: PALETTES[theme].land }}>
      <div ref={el} className="jm-map" />
      {!ready && <div className="jm-loading">Memuat peta…</div>}
      <div className="jm-controls">
        <button onClick={() => mapRef.current?.zoomIn()} title="Perbesar" aria-label="Perbesar">
          +
        </button>
        <button onClick={() => mapRef.current?.zoomOut()} title="Perkecil" aria-label="Perkecil">
          −
        </button>
        <i className="jm-sep" />
        <button className={pitched ? "on" : ""} onClick={toggle3d} title="Tampilan 3D (gedung timbul)" aria-pressed={pitched}>
          3D
        </button>
        <button className={menu ? "on" : ""} onClick={() => setMenu((m) => !m)} title="Suasana peta" aria-expanded={menu}>
          {THEME_ICON[theme]}
        </button>
        <button onClick={() => void locate()} title="Lokasiku" aria-label="Lokasiku" disabled={locating}>
          {locating ? "…" : "⌖"}
        </button>
        <button onClick={showAll} title="Lihat semua tempat" aria-label="Lihat semua tempat">
          ⤢
        </button>
      </div>
      {menu && (
        <div className="jm-menu" role="menu">
          <b>Suasana peta</b>
          {THEME_OPTIONS.map((o) => (
            <button
              key={o.key}
              role="menuitemradio"
              aria-checked={themeSetting === o.key}
              className={themeSetting === o.key ? "on" : ""}
              onClick={() => {
                onThemeSetting(o.key);
                setMenu(false);
              }}
            >
              <span>{o.icon}</span>
              {o.label}
            </button>
          ))}
        </div>
      )}
      {flash && <div className="jm-flash">{flash}</div>}
    </div>
  );
}
