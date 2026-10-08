"use client";

import { useState, type FormEvent } from "react";
import { useVillage } from "../store";

/** Layar PIN, hanya muncul kalau APP_PIN diset di server (sama seperti tepira). */
export default function PinGate() {
  const pinRequired = useVillage((s) => s.snapshot?.pinRequired ?? false);
  const unlocked = useVillage((s) => s.unlocked);
  const unlock = useVillage((s) => s.unlock);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  if (!pinRequired || unlocked) return null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await unlock(pin);
    setBusy(false);
    if (!ok) setPin("");
  };
  return (
    <div className="pin-gate">
      <form className="card pin-card" onSubmit={submit}>
        <h2>🔒 Angka disembunyikan</h2>
        <p className="muted">Masukkan PIN untuk melihat nominal. Desanya tetap bisa dijelajahi.</p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
        />
        <button className="primary" type="submit" disabled={busy || !pin}>Buka</button>
      </form>
    </div>
  );
}
