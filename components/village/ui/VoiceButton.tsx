"use client";

import { useVoiceInput } from "../speech";

/**
 * Tombol 🎤 di samping kolom ⚡ Catat cepat. Dirender hanya kalau browser punya SpeechRecognition, dan
 * hanya di dalam blok moneyVisible: saat angka disembunyikan tombolnya ikut lepas dan mendengar berhenti.
 */
export default function VoiceButton({
  disabled,
  onStart,
  onText,
  onError
}: {
  disabled?: boolean;
  /** dipanggil sebelum mendengar: simpan teks yang sudah diketik supaya ucapan ditambahkan di belakangnya */
  onStart: () => void;
  onText: (spoken: string, final: boolean) => void;
  onError: (message: string) => void;
}) {
  const voice = useVoiceInput({ onText, onError });
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
      onKeyDown={(e) => {
        // Esc = batal mendengar (dan jangan sampai menutup tur desa).
        if (e.key === "Escape" && voice.listening) {
          e.preventDefault();
          voice.cancel();
        }
      }}
      disabled={disabled && !voice.listening}
      aria-pressed={voice.listening}
      aria-label={voice.listening ? "Berhenti mendengarkan" : "Catat lewat suara"}
      title={voice.listening ? "Berhenti mendengarkan" : "Catat lewat suara"}
    >
      {voice.listening ? "⏹" : "🎤"}
    </button>
  );
}
