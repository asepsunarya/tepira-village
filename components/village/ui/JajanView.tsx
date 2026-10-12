"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { expenseCategories } from "@/lib/categories";
import { formatCompact, monthLabel, periodWord as periodWordFor } from "@/lib/format";
import { LIMIT_COLOR, LIMIT_EMOJI, LIMIT_WORD } from "@/lib/place-limits";
import {
  categoryColor,
  categoryIcon,
  jajanSummary,
  normalizePlaceName,
  shortCategory,
  spotMatches,
  type PlaceSpend
} from "@/lib/places";
import { useMoneyVisible, useVillage } from "../store";
import { useLimitViews, useMonthPlaceSpend, type LimitView } from "../usePlaces";
import { PlaceLimitEditor } from "./PlaceLimit";
import { autoTime } from "../layout";
import { themeForVillage } from "../map/gameStyle";
import type { MapFocus, MapPadding } from "../map/JajanMap";

const JajanMap = dynamic(() => import("../map/JajanMap"), {
  ssr: false,
  loading: () => (
    <div className="jm-wrap">
      <div className="jm-loading">Memuat peta…</div>
    </div>
  )
});

/** Ruang yang tertutup sidebar di desktop (lebar .jv-side + jarak tepi, lihat globals.css). */
const SIDE_SPACE = 412;
const NARROW = "(max-width: 760px)";
/** HP: tombol peta di kanan, lembar sidebar menutupi ±18 px bagian bawah peta. */
const SHEET_PADDING: MapPadding = { top: 8, right: 52, bottom: 36, left: 8 };
const SIDE_PADDING: MapPadding = { top: 16, right: 60, bottom: 16, left: SIDE_SPACE };
const TRAVEL = expenseCategories.find((c) => c.key === "transport")!.label;
/** Daftar "Semua tempat" dipotong dulu supaya bulan yang ramai tetap ringan. */
const LIST_LIMIT = 30;

const subscribeNarrow = (onChange: () => void) => {
  const mq = window.matchMedia(NARROW);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const useNarrow = () =>
  useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW).matches,
    () => false
  );

const ring = (category: string | null) => ({ "--ring": categoryColor(category) }) as CSSProperties;

/** Nominal ringkas ("Rp324 rb") yang ikut mode privasi. */
function Amount({ value }: { value: number }) {
  const visible = useMoneyVisible();
  return <span className={`money ${visible ? "" : "hidden"}`}>{visible ? formatCompact(value) : "••••"}</span>;
}

/** Bilah kecil pemakaian batas; disembunyikan saat angka disembunyikan (lebarnya membocorkan nominal). */
function LimitBar({ limit }: { limit: LimitView }) {
  const visible = useMoneyVisible();
  if (!visible) return null;
  return (
    <span className="bar thin" aria-hidden>
      <span style={{ width: `${Math.min(100, Math.round(limit.ratio * 100))}%`, background: LIMIT_COLOR[limit.level] }} />
    </span>
  );
}

function SpotRow({
  spot,
  sub,
  active,
  onPick,
  limit
}: {
  spot: PlaceSpend;
  sub: string;
  active: boolean;
  onPick: () => void;
  limit?: LimitView;
}) {
  return (
    <button className={`jv-row ${active ? "on" : ""} ${limit?.level ?? ""}`} onClick={onPick} title="Lihat di peta">
      <span className="jv-ico" style={ring(spot.topCategory)}>
        {categoryIcon(spot.topCategory)}
      </span>
      <span className="jv-main">
        <b>{spot.name ?? "Titik tanpa nama"}</b>
        <small>
          {limit && limit.level !== "ok" ? `${LIMIT_EMOJI[limit.level]} ${LIMIT_WORD[limit.level]} · ` : ""}
          {sub}
        </small>
        {limit && <LimitBar limit={limit} />}
      </span>
      <span className="jv-amt">
        <Amount value={spot.total} />
      </span>
    </button>
  );
}

/**
 * Peta jajan layar penuh ala "Peta Oyen": peta bergaya desa dengan penanda per tempat, dan
 * sidebar berisi ringkasan bulan, pencarian, filter kategori, tempat langganan, dan tempat baru.
 */
export default function JajanView({ onClose }: { onClose: () => void }) {
  const snapshot = useVillage((s) => s.snapshot);
  const setPanel = useVillage((s) => s.setPanel);
  const shiftPeriod = useVillage((s) => s.shiftPeriod);
  const loading = useVillage((s) => s.loading);
  const timeSetting = useVillage((s) => s.ui.time);
  const themeSetting = useVillage((s) => s.ui.mapTheme ?? "desa");
  const setMapTheme = useVillage((s) => s.setMapTheme);
  const moneyVisible = useMoneyVisible();
  const narrow = useNarrow();
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Dibuka dari kios: langsung sorot tempatnya (sekali, saat tampilan dibuka).
  const [selected, setSelected] = useState<string | null>(() => useVillage.getState().jajanFocus);
  const [focus, setFocus] = useState<MapFocus | null>(() => {
    const key = useVillage.getState().jajanFocus;
    if (!key) return null;
    const known = useVillage.getState().snapshot?.places.find((p) => `n:${normalizePlaceName(p.name)}` === key);
    return { key, n: 1, lat: known?.lat, lng: known?.lng };
  });
  const [showAll, setShowAll] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Fokus keyboard pindah ke dalam tampilan (HUD di belakangnya dibuat inert).
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Isian di dalam tampilan (mis. editor batas) boleh menahan Esc untuk dirinya sendiri.
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const expenses = snapshot?.expenses;
  const placesBefore = snapshot?.placesBefore;
  const all = useMemo(() => jajanSummary(expenses ?? [], placesBefore ?? []), [expenses, placesBefore]);
  // Kategori yang tidak ada di bulan ini (mis. setelah ganti bulan) dianggap "Semua".
  const activeCategory = category && all.categories.some((c) => c.label === category) ? category : null;
  const summary = useMemo(
    () => (activeCategory ? jajanSummary(expenses ?? [], placesBefore ?? [], activeCategory) : all),
    [all, activeCategory, expenses, placesBefore]
  );
  const searching = query.trim().length > 0;
  const visible = useMemo(
    () => (searching ? summary.spots.filter((s) => spotMatches(s, query)) : summary.spots),
    [summary, query, searching]
  );
  const limitViews = useLimitViews();
  const monthSpend = useMonthPlaceSpend();
  const placeLimits = useVillage((s) => s.placeLimits);
  if (!snapshot) return null;

  const { month, year } = snapshot.period;
  const periodWord = periodWordFor(snapshot.period);
  const villageTime = timeSetting === "auto" ? autoTime(snapshot.summary.health.score) : timeSetting;
  const theme = themeSetting === "desa" ? themeForVillage(villageTime) : themeSetting;
  const home = snapshot.places[0] ? { lat: snapshot.places[0].lat, lng: snapshot.places[0].lng } : null;
  const share = all.monthTotal > 0 ? Math.round((all.locatedTotal / all.monthTotal) * 100) : 0;
  const locatedCount = all.spots.reduce((n, s) => n + s.count, 0);
  const pick = (spot: PlaceSpend) => {
    setSelected(spot.key);
    setFocus((f) => ({ key: spot.key, n: (f?.n ?? 0) + 1 }));
  };
  const row = (spot: PlaceSpend, sub: string) => (
    <SpotRow
      key={spot.key}
      spot={spot}
      sub={sub}
      active={selected === spot.key}
      onPick={() => pick(spot)}
      limit={limitViews.get(spot.key)}
    />
  );
  // Kartu tempat terpilih (hanya tempat bernama: batas jajan berlaku per nama).
  const selectedNorm = selected?.startsWith("n:") ? selected.slice(2) : null;
  const selectedSpot = selected ? summary.spots.find((s) => s.key === selected) ?? all.spots.find((s) => s.key === selected) : undefined;
  const selectedMonth = selectedNorm ? monthSpend.get(selectedNorm) : undefined;
  const selectedKnown = selectedNorm ? snapshot.places.find((p) => normalizePlaceName(p.name) === selectedNorm) : undefined;
  const selectedName =
    selectedNorm &&
    (selectedMonth?.name ?? selectedSpot?.name ?? selectedKnown?.name ?? placeLimits[selectedNorm]?.name ?? null);
  const selectedLimit = selected ? limitViews.get(selected) : undefined;
  const selectedCategory = selectedMonth?.topCategory ?? selectedSpot?.topCategory ?? null;
  const detail = (s: PlaceSpend) => `${s.count} catatan · ${s.topCategory ? shortCategory(s.topCategory) : "Lainnya"}`;

  return (
    <div className={`jajan-view theme-${theme}`}>
      <JajanMap
        spots={visible}
        limits={limitViews}
        focus={focus}
        selected={selected}
        onSelect={setSelected}
        hideMoney={!moneyVisible}
        home={home}
        theme={theme}
        themeSetting={themeSetting}
        onThemeSetting={setMapTheme}
        padding={narrow ? SHEET_PADDING : SIDE_PADDING}
      />
      <aside className="jv-side card">
        <header className="jv-head">
          <div>
            <h2>🗺️ Peta jajan</h2>
            <div className="jv-month">
              <button className="icon-btn small" onClick={() => void shiftPeriod(-1)} title="Bulan sebelumnya" disabled={loading}>
                ‹
              </button>
              <span>{monthLabel(month, year)}</span>
              <button className="icon-btn small" onClick={() => void shiftPeriod(1)} title="Bulan berikutnya" disabled={loading}>
                ›
              </button>
            </div>
          </div>
          <button ref={closeRef} className="icon-btn" onClick={onClose} title="Kembali ke desa (Esc)" aria-label="Kembali ke desa">
            ✕
          </button>
        </header>

        <div className="jv-body">
          <section className="jv-hero">
            <small>
              {activeCategory ? `${categoryIcon(activeCategory)} ${shortCategory(activeCategory)}` : "Jajan berlokasi"} · {periodWord}
            </small>
            <div className="jv-big">
              <Amount value={summary.locatedTotal} /> <span className="jv-big-sub">di {summary.spots.length} tempat</span>
            </div>
            {!activeCategory && snapshot.expenses.length > 0 && (
              <small>
                {locatedCount} dari {snapshot.expenses.length} catatan {periodWord} punya lokasi
                {moneyVisible ? ` · ${share}% nominal` : ""}
              </small>
            )}
          </section>

          {selectedNorm && selectedName && (
            <section className="jv-place" data-place={selectedNorm}>
              <div className="jv-place-head">
                <span className="jv-ico" style={ring(selectedCategory)}>
                  {categoryIcon(selectedCategory)}
                </span>
                <span className="jv-main">
                  <b>{selectedName}</b>
                  <small>
                    {selectedMonth ? (
                      <>
                        {selectedMonth.visits}× ke sini {periodWord} · <Amount value={selectedMonth.total} />
                      </>
                    ) : (
                      <>Belum ada jajan di sini {periodWord}.</>
                    )}
                  </small>
                </span>
                <button className="icon-btn small" onClick={() => setSelected(null)} title="Tutup kartu tempat" aria-label="Tutup kartu tempat">
                  ✕
                </button>
              </div>
              {selectedLimit && (
                <>
                  <LimitBar limit={selectedLimit} />
                  <p className={`cat-hint ${selectedLimit.level}`}>
                    {LIMIT_EMOJI[selectedLimit.level]} {LIMIT_WORD[selectedLimit.level]} · <Amount value={selectedLimit.spent} /> dari batas{" "}
                    <Amount value={selectedLimit.limit} /> {periodWord}
                  </p>
                </>
              )}
              {!selectedSpot && !selectedKnown && <small className="muted">Tempat ini belum punya titik di peta.</small>}
              {/* key per tempat: isian yang sedang terbuka tidak terbawa ke tempat lain */}
              <PlaceLimitEditor key={selectedNorm} name={selectedName} />
            </section>
          )}

          <label className="jv-search">
            <span aria-hidden>🔎</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari tempat atau kategori" />
            {searching && (
              <button className="icon-btn small" onClick={() => setQuery("")} title="Hapus pencarian">
                ✕
              </button>
            )}
          </label>

          {all.categories.length > 0 && (
            <div className="jv-chips">
              <button className={`jv-chip ${activeCategory === null ? "on" : ""}`} onClick={() => setCategory(null)}>
                Semua <i>{all.spots.length}</i>
              </button>
              {all.categories.map((c) => (
                <button
                  key={c.label}
                  className={`jv-chip ${activeCategory === c.label ? "on" : ""}`}
                  style={ring(c.label)}
                  onClick={() => setCategory(activeCategory === c.label ? null : c.label)}
                >
                  {categoryIcon(c.label)} {shortCategory(c.label)} <i>{c.places}</i>
                </button>
              ))}
            </div>
          )}

          {searching ? (
            <section>
              <h3>
                🔎 Hasil pencarian <small>{visible.length}</small>
              </h3>
              {visible.length > 0 ? (
                <div className="jv-list">{visible.map((s) => row(s, detail(s)))}</div>
              ) : (
                <p className="jv-note">
                  Tidak ada tempat yang cocok dengan “{query.trim()}”
                  {activeCategory ? ` di kategori ${shortCategory(activeCategory)}` : ""}.
                </p>
              )}
            </section>
          ) : (
            <>
              {!activeCategory && (all.travel.count > 0 || all.unplaced.count > 0) && (
                <div className="jv-list">
                  {all.travel.count > 0 && (
                    <div className="jv-row static">
                      <span className="jv-ico" style={ring(TRAVEL)}>
                        {categoryIcon(TRAVEL)}
                      </span>
                      <span className="jv-main">
                        <b>Perjalanan</b>
                        <small>Transport tanpa tempat · {all.travel.count}×</small>
                      </span>
                      <span className="jv-amt">
                        <Amount value={all.travel.total} />
                      </span>
                    </div>
                  )}
                  {all.unplaced.count > 0 && (
                    <button className="jv-row" onClick={() => setPanel("log")} title="Beri tempat lewat ✏️ di Riwayat">
                      <span className="jv-ico plain">🧾</span>
                      <span className="jv-main">
                        <b>Tanpa tempat</b>
                        <small>
                          {all.unplaced.count} catatan · {all.unplaced.categories.slice(0, 2).join(", ")}
                          {all.unplaced.categories.length > 2 ? ", …" : ""}
                        </small>
                      </span>
                      <span className="jv-amt">
                        <Amount value={all.unplaced.total} />
                      </span>
                    </button>
                  )}
                </div>
              )}

              {all.spots.length === 0 && (
                <div className="jajan-empty">
                  <b>Belum ada pengeluaran berlokasi {periodWord}.</b>
                  <span>
                    Saat mencatat, tekan <b>📍</b> di isian Tempat, atau tulis <i>@nama tempat</i> di catat cepat, misalnya{" "}
                    <i>kopi 20rb @toko djawa</i>. Catatan lama bisa diberi tempat lewat ✏️ di Riwayat.
                  </span>
                  <div className="chips">
                    <button className="pill" onClick={() => setPanel("spend")}>
                      💸 Catat pengeluaran
                    </button>
                    <button className="pill" onClick={() => setPanel("log")}>
                      📜 Riwayat
                    </button>
                  </div>
                </div>
              )}

              {summary.regulars.length > 0 && (
                <section>
                  <h3>
                    ⭐ Tempat langgananmu <small>paling sering</small>
                  </h3>
                  <div className="jv-list">{summary.regulars.slice(0, 5).map((s) => row(s, `${s.visits}× ke sini`))}</div>
                </section>
              )}

              {summary.firstVisits.length > 0 && (
                <section>
                  <h3>
                    ✨ Pertama kali {periodWord} <small>{summary.firstVisits.length} tempat</small>
                  </h3>
                  <div className="jv-cards">
                    {summary.firstVisits.map((s) => (
                      <button
                        key={s.key}
                        className={`jv-card ${selected === s.key ? "on" : ""}`}
                        onClick={() => pick(s)}
                        title="Lihat di peta"
                      >
                        <span className="jv-ico" style={ring(s.topCategory)}>
                          {categoryIcon(s.topCategory)}
                        </span>
                        <b>{s.name}</b>
                        <small>
                          <Amount value={s.total} />
                        </small>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {summary.spots.length > 0 && (
                <section>
                  <h3>
                    📍 Semua tempat <small>{summary.spots.length}</small>
                  </h3>
                  <div className="jv-list">
                    {(showAll ? summary.spots : summary.spots.slice(0, LIST_LIMIT)).map((s) => row(s, detail(s)))}
                  </div>
                  {!showAll && summary.spots.length > LIST_LIMIT && (
                    <button className="pill ghost" onClick={() => setShowAll(true)}>
                      Tampilkan {summary.spots.length - LIST_LIMIT} tempat lagi
                    </button>
                  )}
                </section>
              )}
            </>
          )}

          <p className="jv-note">
            Penanda = tempat · ikon & warna = kategori terbanyak · angka = jumlah catatan. Peta bergaya desa dari ubin
            OpenFreeMap (© OpenMapTiles, data © OpenStreetMap).
          </p>
        </div>
      </aside>
    </div>
  );
}
