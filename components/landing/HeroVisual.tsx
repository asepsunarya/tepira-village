"use client";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import poster from "@/public/landing/village-poster.png";

// three.js + scene baru diunduh saat hero terlihat & browser sedang santai.
const DemoIsland = dynamic(() => import("./DemoIsland"), { ssr: false, loading: () => null });

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

let webglSupport: boolean | null = null;
function hasWebGL() {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement("canvas");
    // three r163+ hanya mendukung WebGL2; render software (performa jauh turun) juga tetap pakai poster.
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    webglSupport = Boolean(gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

function prefersPoster() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  return reduce || saveData || !hasWebGL();
}

/** Kalau WebGL/scene gagal, cukup kembali ke poster tanpa mengganggu halaman. */
class DemoBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function HeroVisual() {
  const box = useRef<HTMLDivElement>(null);
  const [allowed, setAllowed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);

  // Poster permanen untuk reduced-motion, hemat data, atau tanpa WebGL.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAllowed(!prefersPoster());
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "160px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Mulai unduh setelah halaman selesai dimuat lalu browser idle, supaya first paint tidak terganggu.
  useEffect(() => {
    if (!allowed || !visible || started) return;
    const w = window as IdleWindow;
    let idleId: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const kick = () => {
      if (w.requestIdleCallback) idleId = w.requestIdleCallback(() => setStarted(true), { timeout: 2500 });
      else timer = setTimeout(() => setStarted(true), 900);
    };
    if (document.readyState === "complete") kick();
    else window.addEventListener("load", kick, { once: true });
    return () => {
      window.removeEventListener("load", kick);
      if (idleId !== undefined) w.cancelIdleCallback?.(idleId);
      if (timer) clearTimeout(timer);
    };
  }, [allowed, visible, started]);

  const live = allowed && started && !failed;
  const active = live && visible && pageVisible && !paused;

  // Kalau demo dilepas (mis. reduced-motion dinyalakan), mulai lagi dari poster.
  useEffect(() => {
    if (!live) setReady(false);
  }, [live]);

  return (
    <div ref={box} className={`lp-visual ${live && ready ? "is-live" : ""}`}>
      <Image
        src={poster}
        alt="Pulau desa tepira: rumah-rumah goal tabungan di berbagai tahap, dari lahan kosong, fondasi, pasang atap, sampai satu rumah yang sudah selesai, lengkap dengan balai desa, warung, dan peti dompet."
        className="lp-visual-poster"
        fill
        priority
        placeholder="blur"
        sizes="(min-width: 960px) 560px, (min-width: 632px) 600px, calc(100vw - 32px)"
      />
      {live && (
        <DemoBoundary onError={() => setFailed(true)}>
          <div className="lp-visual-live" aria-hidden="true">
            <DemoIsland active={active} onReady={() => setReady(true)} />
          </div>
        </DemoBoundary>
      )}
      <span className="lp-visual-badge">
        <span aria-hidden="true">🏝️</span> Desa contoh · angka fiktif
      </span>
      {live && ready && (
        <button
          type="button"
          className="lp-visual-btn"
          aria-label={paused ? "Putar lagi animasi desa" : "Jeda animasi desa"}
          onClick={() => setPaused((p) => !p)}
        >
          <span aria-hidden="true">{paused ? "▶" : "❚❚"}</span>
          {paused ? "Putar" : "Jeda"}
        </button>
      )}
    </div>
  );
}
