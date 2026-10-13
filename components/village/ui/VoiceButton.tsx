"use client";

import type { VoiceInput } from "../speech";

/**
 * Tombol 🎤 di samping kolom ⚡ Catat cepat. Dirender hanya kalau browser punya SpeechRecognition.
 * Sesi suaranya (useVoiceInput) dipegang SpendPanel, supaya menyimpan dan menyembunyikan angka bisa
 * memutusnya; Esc ditangani hook-nya.
 */
export default function VoiceButton({
  voice,
  disabled,
  onStart
}: {
  voice: VoiceInput;
  disabled?: boolean;
  /** dipanggil sebelum mendengar: simpan teks yang sudah diketik supaya ucapan ditambahkan di belakangnya */
  onStart: () => void;
}) {
  if (!voice.supported) return null;
  return (
    <button
      type="button"
      className={`icon-btn mic ${voice.listening ? "on" : ""}`}
      onClick={() => {
        if (voice.listening) voice.stop();
        else {
          onStart();
          voice.start();
        }
      }}
      disabled={disabled && !voice.listening}
      aria-pressed={voice.listening}
      aria-label={voice.listening ? "Berhenti mendengarkan" : "Catat lewat suara"}
      title={voice.listening ? "Berhenti mendengarkan (Esc = batal)" : "Catat lewat suara"}
    >
      {voice.listening ? "⏹" : "🎤"}
    </button>
  );
}
