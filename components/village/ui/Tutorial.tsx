"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { Snapshot } from "@/lib/game";
import { monthLabel } from "@/lib/format";
import { useVillage } from "../store";
import { TOUR_LAST_STEP, periodKey, tourOwner, type TourBaseline, type TourHits } from "../tutorial/progress";
import { NO_TARGET, TOUR_STEPS, type Target, type TourStep } from "../tutorial/steps";

/**
 * Tur desa (coach mark) untuk pengguna baru: menyorot UI asli lewat [data-tour],
 * menunggu user benar-benar melakukan aksinya, lalu lanjut sendiri saat snapshot
 * menunjukkan aksinya berhasil. Lapisan gelapnya pointer-events:none, jadi
 * seluruh desa tetap bisa dipakai; hanya kartu panduannya yang menangkap klik.
 */

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Geo {
  /** indeks kandidat sasaran yang dipakai */
  index: number;
  hole: Box | null;
  panel: Box | null;
  dock: Box | null;
  inPanel: boolean;
  inDock: boolean;
  vw: number;
  vh: number;
}

type Side = "top" | "bottom" | "left" | "right";
type Placement =
  | { mode: "center" }
  | { mode: "banner"; edge: "top" | "bottom"; bottom: number }
  | { mode: "float"; left: number; top: number; width: number; arrow: { side: Side; at: number } | null };

const MARGIN = 12;
const GAP = 14;
const PAD = 6;
const MOBILE = 640;
const CARD_W = 340;
/** Kartu lebih sempit dari ini → banner (di layar sempit dengan panel terbuka). */
const CARD_MIN_W = 200;
/** Layar pendek: isi kartu diringkas (lihat juga @media (max-height: 640px) di globals.css). */
const SHORT = 640;

const boxOf = (el: Element | null): Box | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
};

function intersect(a: Box, b: Box): Box | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  return right - left > 4 && bottom - top > 4 ? { left, top, width: right - left, height: bottom - top } : null;
}

const round = (b: Box): Box => ({
  left: Math.round(b.left),
  top: Math.round(b.top),
  width: Math.round(b.width),
  height: Math.round(b.height)
});

/**
 * Area panel yang benar-benar kelihatan: area scroll dikurangi footer sticky (mis. tombol
 * Simpan alokasi), kecuali sasarannya ada di footer itu sendiri.
 */
function visibleArea(scroller: Element, els: Element[]): Box | null {
  const area = boxOf(scroller);
  if (!area) return null;
  const footer = scroller.querySelector(".alloc-footer");
  if (footer && !els.some((el) => footer.contains(el))) {
    const f = footer.getBoundingClientRect();
    const bottom = Math.min(area.top + area.height, f.top);
    if (f.height > 0 && bottom > area.top) return { ...area, height: bottom - area.top };
  }
  return area;
}

/** Geser area scroll panel seperlunya (block: "nearest") supaya sasaran kelihatan. */
function revealInPanel(scroller: Element, els: Element[], reduced: boolean) {
  // Jangan ganggu user yang sedang mengetik di panel.
  const active = document.activeElement;
  if (active && scroller.contains(active) && active.matches("input, textarea, select")) return;
  const area = visibleArea(scroller, els);
  if (!area) return;
  let top = Infinity;
  let bottom = -Infinity;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    top = Math.min(top, r.top);
    bottom = Math.max(bottom, r.bottom);
  }
  const viewTop = area.top + 8;
  const viewBottom = area.top + area.height - 8;
  const delta =
    top < viewTop || bottom - top > viewBottom - viewTop ? top - viewTop : bottom > viewBottom ? bottom - viewBottom : 0;
  if (Math.abs(delta) > 1) scroller.scrollBy({ top: delta, behavior: reduced ? "auto" : "smooth" });
}

/** Kotak sorotan: gabungan elemen, dipotong area panel yang kelihatan & layar. */
function holeFor(t: Target, els: Element[], vw: number, vh: number): Box | null {
  let l = Infinity;
  let tp = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (const el of els) {
    const rect = el.getBoundingClientRect();
    l = Math.min(l, rect.left);
    tp = Math.min(tp, rect.top);
    r = Math.max(r, rect.right);
    b = Math.max(b, rect.bottom);
  }
  b += t.extendDown ?? 0;
  let box: Box | null = { left: l - PAD, top: tp - PAD, width: r - l + PAD * 2, height: b - tp + PAD * 2 };
  const scrollerEl = els[0].closest(".panel-body");
  const scroller = scrollerEl ? visibleArea(scrollerEl, els) : null;
  if (scroller) box = intersect(box, { ...scroller, left: scroller.left - PAD, width: scroller.width + PAD * 2 });
  if (box) box = intersect(box, { left: 0, top: 0, width: vw, height: vh });
  return box ? round(box) : null;
}

function resolve(list: Target[]): { geo: Geo; els: Element[] } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const panel = boxOf(document.querySelector(".panel"));
  const dock = boxOf(document.querySelector(".dock"));
  const base = { panel: panel && round(panel), dock: dock && round(dock), vw, vh };
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (!t.find) return { geo: { ...base, index: i, hole: null, inPanel: false, inDock: false }, els: [] };
    const els = t.find().filter((el) => el.getClientRects().length > 0);
    if (els.length === 0) continue;
    const hole = holeFor(t, els, vw, vh);
    const inPanel = Boolean(els[0].closest(".panel"));
    const inDock = Boolean(els[0].closest(".dock"));
    // Label dunia di luar layar, atau sasaran di luar panel yang tertutup panel (label dunia,
    // kartu HUD di layar sempit), tidak berguna disorot: coba kandidat berikutnya.
    if (t.world && !hole) continue;
    if (hole && panel && !inPanel && !inDock && intersect(hole, panel)) continue;
    return { geo: { ...base, index: i, hole, inPanel, inDock }, els };
  }
  return { geo: { ...base, index: Math.max(0, list.length - 1), hole: null, inPanel: false, inDock: false }, els: [] };
}

/** Ukur sasaran tiap frame (panel slide-in, scroll, resize, label 3D yang ikut kamera). */
function useTargetGeo(targetsRef: RefObject<Target[]>) {
  const [geo, setGeo] = useState<Geo | null>(null);
  useEffect(() => {
    let raf = 0;
    let lastKey = "";
    let lastReveal = "";
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const list = targetsRef.current;
      const { geo: next, els } = resolve(list);
      const id = list[next.index]?.id ?? "";
      // Sasaran di dalam panel yang ter-scroll: geser sekali per langkah/sasaran. Diulang hanya
      // kalau area panel berpindah/berubah ukuran (mis. banner mendorong panel ke bawah),
      // jadi scroll manual user tidak pernah dilawan.
      const scroller = els[0]?.closest(".panel-body") ?? null;
      const area = scroller ? boxOf(scroller) : null;
      const revealKey = `${useVillage.getState().tour.step}|${id}|${area ? `${Math.round(area.top)}|${Math.round(area.height)}` : ""}`;
      if (revealKey !== lastReveal) {
        lastReveal = revealKey;
        if (scroller && area) revealInPanel(scroller, els, reduced);
      }
      const key = JSON.stringify(next);
      if (key !== lastKey) {
        lastKey = key;
        setGeo(next);
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [targetsRef]);
  return geo;
}

function placeCard(step: TourStep, geo: Geo, h: number | null): Placement {
  if (step.centered) return { mode: "center" };
  const { vw, vh, hole, panel, dock } = geo;
  const mobile = vw <= MOBILE;
  // Panel di kanan tidak boleh ketutup kartu: batasi kartu di sebelah kirinya.
  const right = panel && !mobile ? panel.left - MARGIN : vw - MARGIN;
  const width = Math.min(CARD_W, right - MARGIN - (geo.inPanel ? GAP : 0));
  if (mobile || width < CARD_MIN_W) {
    const bottom = dock ? Math.round(vh - dock.top + 8) : 96;
    const atTop = Boolean(hole && !panel && hole.top < (h ?? 120) + 20);
    return { mode: "banner", edge: atTop ? "bottom" : "top", bottom };
  }
  const ch = h ?? 0;
  const clampX = (x: number) => Math.round(Math.max(MARGIN, Math.min(x, right - width)));
  const clampY = (y: number) => Math.round(Math.max(MARGIN, Math.min(y, vh - MARGIN - ch)));
  const arrowAt = (v: number, size: number) => Math.round(Math.max(18, Math.min(v, size - 18)));

  if (!hole) {
    const top = dock ? dock.top - GAP - ch : (vh - ch) / 2;
    return { mode: "float", left: clampX((MARGIN + right) / 2 - width / 2), top: clampY(top), width, arrow: null };
  }
  const cx = hole.left + hole.width / 2;
  const cy = hole.top + hole.height / 2;
  if (geo.inPanel && panel) {
    const top = clampY(cy - ch / 2);
    return { mode: "float", left: Math.round(panel.left - GAP - width), top, width, arrow: { side: "right", at: arrowAt(cy - top, ch) } };
  }
  const fits: Record<Side, boolean> = {
    bottom: hole.top + hole.height + GAP + ch <= vh - MARGIN,
    right: hole.left + hole.width + GAP + width <= right,
    top: hole.top - GAP - ch >= MARGIN,
    left: hole.left - GAP - width >= MARGIN
  };
  const order: Side[] = geo.inDock ? ["top", "bottom", "right", "left"] : ["bottom", "right", "top", "left"];
  const side = order.find((s) => fits[s]) ?? (geo.inDock ? "top" : "bottom");
  // `side` = sisi sasaran tempat kartu diletakkan; panah ada di sisi kartu yang berlawanan.
  if (side === "top" || side === "bottom") {
    const left = clampX(cx - width / 2);
    const top = clampY(side === "top" ? hole.top - GAP - ch : hole.top + hole.height + GAP);
    return { mode: "float", left, top, width, arrow: { side: side === "top" ? "bottom" : "top", at: arrowAt(cx - left, width) } };
  }
  const top = clampY(cy - ch / 2);
  const left = clampX(side === "right" ? hole.left + hole.width + GAP : hole.left - GAP - width);
  return { mode: "float", left, top, width, arrow: { side: side === "right" ? "left" : "right", at: arrowAt(cy - top, ch) } };
}

/** Langkah berikutnya (atau halaman berikutnya di langkah bertahap). */
function advanceTour() {
  const s = useVillage.getState();
  const step = TOUR_STEPS[s.tour.step];
  if (step && s.tour.page < step.pages.length - 1) s.setTourPage(s.tour.page + 1);
  else if (s.tour.step < TOUR_LAST_STEP) s.startTour(s.tour.step + 1);
  else s.endTour("done");
}

function backTour() {
  const s = useVillage.getState();
  if (s.tour.page > 0) s.setTourPage(s.tour.page - 1);
  else if (s.tour.step > 1) s.startTour(s.tour.step - 1);
}

// ── Langkah "kenalan sama pulau": centang kecil saat user mencoba ────────────

function ExploreTries() {
  const [tries, setTries] = useState({ rotate: false, zoom: false, click: false });
  useEffect(() => {
    const inCanvas = (e: Event) => e.target instanceof Element && Boolean(e.target.closest(".canvas"));
    let down: { x: number; y: number } | null = null;
    let tapAt = 0;
    const mark = (key: keyof typeof tries) => setTries((t) => (t[key] ? t : { ...t, [key]: true }));
    const onDown = (e: PointerEvent) => {
      down = inCanvas(e) ? { x: e.clientX, y: e.clientY } : null;
    };
    const onMove = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 14) mark("rotate");
    };
    const onUp = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) tapAt = Date.now();
      down = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (inCanvas(e)) mark("zoom");
    };
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length >= 2 && inCanvas(e)) mark("zoom");
    };
    // Klik objek 3D membuka panel lewat store; cocokkan dengan tap di kanvas barusan.
    const unsub = useVillage.subscribe((s, prev) => {
      if (s.panel && s.panel !== prev.panel && Date.now() - tapAt < 700) mark("click");
    });
    const opts = { capture: true, passive: true } as const;
    window.addEventListener("pointerdown", onDown, opts);
    window.addEventListener("pointermove", onMove, opts);
    window.addEventListener("pointerup", onUp, opts);
    window.addEventListener("wheel", onWheel, opts);
    window.addEventListener("touchstart", onTouch, opts);
    return () => {
      unsub();
      window.removeEventListener("pointerdown", onDown, opts);
      window.removeEventListener("pointermove", onMove, opts);
      window.removeEventListener("pointerup", onUp, opts);
      window.removeEventListener("wheel", onWheel, opts);
      window.removeEventListener("touchstart", onTouch, opts);
    };
  }, []);
  const chip = (on: boolean, icon: string, label: string) => (
    <span className={`pill ${on ? "on" : ""}`}>
      {on ? "✓" : icon} {label}
    </span>
  );
  return (
    <div className="tour-tries" aria-label="Yang sudah dicoba">
      {chip(tries.rotate, "🔄", "Putar")}
      {chip(tries.zoom, "🔍", "Zoom")}
      {chip(tries.click, "👆", "Klik objek")}
    </div>
  );
}

// ── Kartu panduan ────────────────────────────────────────────────────────────

function TourCard({
  step,
  stepIndex,
  page,
  snapshot,
  baseline,
  target,
  geo,
  hits,
  happened,
  satisfied
}: {
  step: TourStep;
  stepIndex: number;
  page: number;
  snapshot: Snapshot;
  baseline: TourBaseline | null;
  target: Target;
  geo: Geo;
  hits: TourHits;
  happened: boolean;
  satisfied: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const error = useVillage((s) => s.error);
  const loading = useVillage((s) => s.loading);
  const endTour = useVillage((s) => s.endTour);
  const setPeriod = useVillage((s) => s.setPeriod);
  const action = step.action;
  const canNext = step.kind !== "action" || satisfied || happened;

  // Fokus pindah ke kartu tiap langkah baru (tanpa mengunci fokus di sana), kecuali user
  // sedang memakai kolom/panel (mis. setelah lanjut otomatis). Kartu float yang belum diukur
  // memakai opacity 0, bukan visibility hidden, supaya tetap bisa difokus.
  useEffect(() => {
    const active = document.activeElement;
    if (active && active !== document.body && active.closest("input, textarea, select, [contenteditable], .panel")) return;
    cardRef.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const update = () => setHeight((h) => (h === el.offsetHeight ? h : el.offsetHeight));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Aksi berhasil → rayakan sebentar, lalu lanjut sendiri.
  useEffect(() => {
    if (!happened) return;
    const t = setTimeout(advanceTour, action?.celebrateMs ?? 2800);
    return () => clearTimeout(t);
  }, [happened, action]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      if (e.key === "Escape") {
        // Esc di kolom isian milik kolom itu (batal ketik, tutup autofill), bukan untuk menutup tur.
        const el = e.target instanceof Element ? e.target : null;
        if (el?.closest("input, textarea, select, [contenteditable]")) return;
        e.preventDefault();
        endTour("skipped");
        return;
      }
      if ((e.key === "Enter" || e.key === "ArrowRight") && canNext) {
        // Jangan bajak Enter di form / tombol yang sedang fokus.
        const el = e.target instanceof Element ? e.target : null;
        if (el?.closest("input, textarea, select, button, a, [contenteditable]")) return;
        e.preventDefault();
        advanceTour();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canNext, endTour]);

  const placement = placeCard(step, geo, height);
  const bannerTop = placement.mode === "banner" && placement.edge === "top";
  // Layar pendek: teks panduan dipotong 3 baris, bisa dibuka lewat "Detail".
  const short = geo.vh <= SHORT && placement.mode !== "center";
  const clamp = short && !expanded;

  // Isi baru hampir selalu mengubah tinggi kartu, jadi cukup diukur ulang saat tinggi berubah.
  useLayoutEffect(() => {
    const b = bodyRef.current;
    setClipped(Boolean(b && clamp && b.scrollHeight > b.clientHeight + 1));
  }, [clamp, height]);

  // Banner di atas layar: panel didorong ke bawahnya supaya tidak tertutup.
  useLayoutEffect(() => {
    if (!bannerTop || height === null) return;
    const root = document.documentElement;
    root.dataset.tourBanner = "top";
    root.style.setProperty("--tour-banner-h", `${height}px`);
    return () => {
      delete root.dataset.tourBanner;
      root.style.removeProperty("--tour-banner-h");
    };
  }, [bannerTop, height]);

  const state: "waiting" | "already" | "done" | null = !action
    ? null
    : happened
      ? "done"
      : satisfied
        ? "already"
        : "waiting";
  const body =
    action && state === "done" && baseline
      ? action.done(snapshot, baseline, hits)
      : action && state === "already"
        ? action.already(snapshot)
        : target.body;
  const title = target.title ?? step.title(snapshot);
  const start = action?.periodBound ? baseline?.start : undefined;
  const awayFromStart = Boolean(start && (start.month !== snapshot.period.month || start.year !== snapshot.period.year));

  const style: CSSProperties =
    placement.mode === "float"
      ? {
          left: placement.left,
          top: placement.top,
          width: placement.width,
          ...(height === null ? ({ opacity: 0, pointerEvents: "none" } as const) : {})
        }
      : placement.mode === "banner" && placement.edge === "bottom"
        ? { bottom: placement.bottom }
        : {};
  const modeClass = placement.mode === "banner" ? `banner ${placement.edge}` : placement.mode;
  const numbered = stepIndex >= 1;

  return (
    <div
      ref={cardRef}
      className={`tour-card card ${modeClass} kind-${step.kind} ${state === "done" ? "celebrate" : ""}`}
      style={style}
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-title"
      aria-describedby="tour-body"
      tabIndex={-1}
    >
      <div className="tour-head">
        {numbered && (
          <>
            <span className="tour-count">
              {stepIndex}/{TOUR_LAST_STEP}
            </span>
            <span className="tour-dots" aria-hidden>
              {Array.from({ length: TOUR_LAST_STEP }, (_, i) => (
                <i key={i} className={i < stepIndex ? "on" : ""} />
              ))}
            </span>
          </>
        )}
        <button className="tour-close" onClick={() => endTour("skipped")} title="Keluar tur (Esc)">
          Keluar tur ✕
        </button>
      </div>

      {step.kind === "welcome" && (
        <div className="tour-hero" aria-hidden>
          🏡🪙🌤️
        </div>
      )}
      <h2 id="tour-title">{title}</h2>
      <div id="tour-body" ref={bodyRef} className={`tour-body ${clamp ? "clamp" : ""}`} aria-live="polite">
        {body}
      </div>
      {short && (clipped || expanded) && (
        <button
          className="link-btn tour-more"
          aria-expanded={expanded}
          aria-controls="tour-body"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Ringkas ▴" : "Detail ▾"}
        </button>
      )}

      {step.id === "explore" && <ExploreTries />}

      {state === "done" && (
        <span className="tour-burst" aria-hidden>
          🎉
        </span>
      )}

      {awayFromStart && state !== "done" && start && (
        <p className="tour-note">
          📅 Kamu sedang melihat {monthLabel(snapshot.period.month, snapshot.period.year)}. Langkah ini dicek untuk bulan
          yang sedang dibuka.{" "}
          <button className="link-btn" onClick={() => void setPeriod(start.month, start.year)}>
            Kembali ke {monthLabel(start.month, start.year)}
          </button>
        </p>
      )}
      {action && state === "waiting" && error && (
        <p className="tour-error">⚠️ Belum tersimpan: {error} Coba lagi, langkah ini tetap menunggu.</p>
      )}

      <div className="tour-bottom">
        {action && state && (
          <div className={`tour-goal ${state}`}>
            <span>
              🎯 {action.goal(snapshot)}
              {action.optional && <span className="tour-optional">opsional</span>}
            </span>
            <b className="tour-state">
              {state === "done"
                ? "🎉 Berhasil!"
                : state === "already"
                  ? (action.alreadyLabel ?? "Sudah ✓")
                  : loading
                    ? "💾 Menyimpan…"
                    : "⏳ Menunggu kamu"}
            </b>
          </div>
        )}
        <div className="tour-foot">
          {step.kind === "welcome" ? (
            <>
              <button className="pill ghost" onClick={() => endTour("skipped")}>
                Nanti saja
              </button>
              <button className="primary" onClick={advanceTour}>
                Mulai tur (±2 menit)
              </button>
            </>
          ) : (
            <>
              {state === "waiting" ? (
                <button className="link-btn" onClick={advanceTour}>
                  {action?.optional ? "Lewati (opsional)" : "Lewati langkah ini"}
                </button>
              ) : (
                (stepIndex > 1 || page > 0) &&
                state === null && (
                  <button className="link-btn" onClick={backTour}>
                    ‹ Kembali
                  </button>
                )
              )}
              {canNext && (
                <button className="primary" onClick={advanceTour}>
                  {step.kind === "finish" ? "Selesai 🎉" : "Lanjut →"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {placement.mode === "float" && placement.arrow && (
        <i
          className={`tour-arrow ${placement.arrow.side}`}
          style={placement.arrow.side === "top" || placement.arrow.side === "bottom" ? { left: placement.arrow.at } : { top: placement.arrow.at }}
          aria-hidden
        />
      )}
    </div>
  );
}

// ── Lapisan sorotan ──────────────────────────────────────────────────────────

function TourLayer({ snapshot }: { snapshot: Snapshot }) {
  const tour = useVillage((s) => s.tour);
  const hits = useVillage((s) => s.tourHits);
  const panel = useVillage((s) => s.panel);
  const rebaseTour = useVillage((s) => s.rebaseTour);
  const setPanel = useVillage((s) => s.setPanel);
  const step = TOUR_STEPS[tour.step] ?? TOUR_STEPS[0];
  const page = Math.min(tour.page, step.pages.length - 1);
  const baseline = tour.baseline;
  const period = periodKey(snapshot);
  const action = step.action;
  const happened = Boolean(action && baseline && baseline.period === period && action.happened(snapshot, baseline, hits));
  const satisfied = Boolean(action?.satisfied(snapshot));

  // Pindah bulan → bandingkan dengan data bulan yang sedang dilihat.
  useEffect(() => {
    if (!baseline || baseline.period !== period) rebaseTour();
  }, [baseline, period, rebaseTour]);

  // Di HP panel menutupi pulau: tutup supaya hasilnya kelihatan di dunia 3D.
  const celebrates = happened && Boolean(action?.celebrate);
  useEffect(() => {
    if (celebrates && window.innerWidth <= MOBILE) setPanel(null);
  }, [celebrates, setPanel]);

  // Saat merayakan: sorot hasilnya di pulau; kalau labelnya tidak kelihatan, tanpa sorotan.
  const targets: Target[] =
    happened && action?.celebrate && baseline
      ? [...action.celebrate(snapshot, baseline, hits), NO_TARGET]
      : step.pages[page]({ snapshot, panel });
  const targetsRef = useRef<Target[]>(targets);
  useLayoutEffect(() => {
    targetsRef.current = targets;
  });
  const geo = useTargetGeo(targetsRef);
  if (!geo) return null;

  const target = targets[Math.min(geo.index, targets.length - 1)] ?? NO_TARGET;
  const title = target.title ?? step.title(snapshot);
  // Satu live region tetap (di luar kartu yang dipasang ulang tiap langkah) supaya pembaca layar
  // mengumumkan pergantian langkah.
  const announce = tour.step >= 1 ? `Langkah ${tour.step} dari ${TOUR_LAST_STEP}: ${title}` : `Tur desa: ${title}`;
  const dim = happened ? 0.2 : (step.dim ?? 0.38);
  const hole = geo.hole ?? { left: geo.vw / 2, top: geo.vh / 2, width: 0, height: 0 };
  const holeStyle = {
    left: hole.left,
    top: hole.top,
    width: hole.width,
    height: hole.height,
    "--tour-dim": dim
  } as CSSProperties;

  return (
    <div className="tour-layer">
      <div className="tour-sr" role="status" aria-live="polite">
        {announce}
      </div>
      <div className={`tour-hole ${geo.hole ? "" : "none"}`} style={holeStyle} aria-hidden />
      <TourCard
        key={tour.step}
        step={step}
        stepIndex={tour.step}
        page={page}
        snapshot={snapshot}
        baseline={baseline}
        target={target}
        geo={geo}
        hits={hits}
        happened={happened}
        satisfied={satisfied}
      />
    </div>
  );
}

/** Tur sedang tampil (dipakai VillageApp untuk kelas `tour-on`). */
export function useTourOn() {
  return useVillage((s) => {
    const snap = s.snapshot;
    return Boolean(snap && s.tour.active && s.tour.owner === tourOwner(snap) && (!snap.pinRequired || s.unlocked));
  });
}

export default function Tutorial({ email, isNew }: { email: string | null; isNew: boolean }) {
  const snapshot = useVillage((s) => s.snapshot);
  const unlocked = useVillage((s) => s.unlocked);
  const initTour = useVillage((s) => s.initTour);
  const on = useTourOn();
  // Tunggu snapshot user ini (bukan sisa demo/user lain) dan PIN terbuka.
  const ready = Boolean(snapshot && snapshot.user.email === email && (!snapshot.pinRequired || unlocked));

  useEffect(() => {
    if (ready) initTour(isNew);
  }, [ready, isNew, initTour]);

  if (!ready || !on || !snapshot) return null;
  return <TourLayer snapshot={snapshot} />;
}
