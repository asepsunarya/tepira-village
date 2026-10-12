"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * 🎤 Catat lewat suara: Web Speech API (SpeechRecognition) di browser.
 * - Chrome/Edge (desktop & Android) dan Safari (macOS/iOS 14.5+) punya; Firefox tidak → tombol disembunyikan.
 * - Chrome mengirim audionya ke server Google; Safari ke Apple. Tidak ada yang lewat server desa.
 * - Mikrofon hanya diizinkan di https atau localhost (sama seperti 📍 lokasi).
 * TS 5.9 lib.dom hanya punya SpeechRecognitionResult(List)/Alternative, bukan SpeechRecognition
 * itu sendiri, jadi tipenya ditulis lokal (tanpa `declare global` supaya tidak bentrok saat TS menambahkannya).
 */

interface RecognitionResultEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface RecognitionErrorEvent {
  error: string;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscribe = () => () => {};

/** false di server dan di browser tanpa SpeechRecognition (Firefox): tombol 🎤 tidak dirender. */
export function useSpeechSupported() {
  return useSyncExternalStore(noSubscribe, () => recognitionCtor() !== null, () => false);
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Izin mikrofon ditolak. Aktifkan di pengaturan browser untuk situs ini.",
  "service-not-allowed": "Pengenal suara tidak diizinkan. Di iPhone, aktifkan Dikte/Siri dulu.",
  "no-speech": "Belum terdengar suara. Tekan 🎤 lalu langsung bicara.",
  "audio-capture": "Mikrofon tidak ditemukan.",
  network: "Pengenal suara butuh internet (dan tidak jalan di sebagian browser, mis. Brave).",
  "language-not-supported": "Bahasa Indonesia belum didukung browser ini."
};

/** Batas aman: Safari kadang terus mendengar sampai stop() dipanggil. */
const MAX_LISTEN_MS = 12_000;

export interface VoiceHandlers {
  /** teks yang terdengar sejauh ini (interim, berulang), terakhir dengan final = true */
  onText: (text: string, final: boolean) => void;
  onError: (message: string) => void;
}

export function useVoiceInput(handlers: VoiceHandlers, lang = "id-ID") {
  const supported = useSpeechSupported();
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hasil suara datang di luar render: selalu panggil handler terbaru (closure lama = state lama).
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  const release = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    rec.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || rec.current) return;
    if (!window.isSecureContext) {
      latest.current.onError("Mikrofon hanya jalan di https atau localhost.");
      return;
    }
    const r = new Ctor();
    r.lang = lang;
    r.continuous = false; // satu kalimat; Chrome Android menggandakan hasil kalau continuous
    r.interimResults = true; // kolom terisi selagi bicara
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      let text = "";
      let final = true;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0]?.transcript ?? "";
        if (!e.results[i].isFinal) final = false;
      }
      latest.current.onText(text.replace(/\s+/g, " ").trim(), final);
    };
    r.onerror = (e) => {
      if (e.error !== "aborted") latest.current.onError(ERRORS[e.error] ?? "Suara gagal dibaca. Coba lagi.");
    };
    r.onend = release;
    try {
      r.start();
      rec.current = r;
      setListening(true);
      timer.current = setTimeout(() => r.stop(), MAX_LISTEN_MS);
    } catch {
      latest.current.onError("Mikrofon sedang dipakai. Coba lagi sebentar.");
    }
  }, [lang, release]);

  /** stop() = selesai mendengar, hasil terakhir tetap dikirim; cancel() = batal tanpa hasil. */
  const stop = useCallback(() => rec.current?.stop(), []);
  const cancel = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
    r.abort();
    release();
  }, [release]);

  // Panel ditutup / mode sembunyikan angka → komponen dilepas → berhenti mendengar.
  useEffect(() => () => cancel(), [cancel]);

  return { supported, listening, start, stop, cancel };
}
