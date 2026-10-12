"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { expenseCategories } from "@/lib/categories";
import { MONTHS_ID, formatCompact, monthLabel } from "@/lib/format";
import { categoryColor, categoryIcon, jajanSummary, shortCategory, spotMatches, type PlaceSpend } from "@/lib/places";
import { useMoneyVisible, useVillage } from "../store";
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

function SpotRow({ spot, sub, active, onPick }: { spot: PlaceSpend; sub: string; active: boolean; onPick: () => void }) {
  return (
    <button className={`jv-row ${active ? "on" : ""}`} onClick={onPick} title="Lihat di peta">
      <span className="jv-ico" style={ring(spot.topCategory)}>
        {categoryIcon(spot.topCategory)}
      </span>
      <span className="jv-main">
        <b>{spot.name ?? "Titik tanpa nama"}</b>
        <small>{sub}</small>
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
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
  if (!snapshot) return null;

  const { month, year } = snapshot.period;
  const now = new Date();
  const periodWord = month === now.getMonth() + 1 && year === now.getFullYear() ? "bulan ini" : `di ${MONTHS_ID[month - 1]}`;
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
    <SpotRow key={spot.key} spot={spot} sub={sub} active={selected === spot.key} onPick={() => pick(spot)} />
  );
  const detail = (s: PlaceSpend) => `${s.count}× · ${s.topCategory ? shortCategory(s.topCategory) : "Lainnya"}`;

  return (
    <div className={`jajan-view theme-${theme}`}>
      <JajanMap
        spots={visible}
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
          <button className="icon-btn" onClick={onClose} title="Kembali ke desa (Esc)">
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
                  <div className="jv-list">{summary.regulars.slice(0, 5).map((s) => row(s, `${s.count}× ke sini`))}</div>
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
            Penanda = tempat · ikon & warna = kategori terbanyak · angka = jumlah catatan. Peta bergaya desa dari data ©
            OpenStreetMap (OpenFreeMap).
          </p>
        </div>
      </aside>
    </div>
  );
}
