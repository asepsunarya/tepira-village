"use client";

import { useState } from "react";
import { formatRupiah } from "@/lib/format";
import { LIMIT_EMOJI, LIMIT_WORD, MAX_LIMIT, findPlaceLimit, limitStatus } from "@/lib/place-limits";
import { useVillage } from "../store";
import { AmountInput } from "./inputs";
import { Money } from "./Money";

/** Atur/ubah/hapus batas jajan bulanan untuk satu tempat (tersimpan di akun, ikut ke perangkat lain). */
export function PlaceLimitEditor({ name }: { name: string }) {
  const current = useVillage((s) => findPlaceLimit(s.placeLimits, name));
  const setPlaceLimit = useVillage((s) => s.setPlaceLimit);
  const synced = useVillage((s) => s.syncBase.available);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(0);
  if (!editing) {
    return (
      <button
        className="pill deadline-open"
        onClick={() => {
          setAmount(current?.limit ?? 0);
          setEditing(true);
        }}
      >
        {current ? "✏️ Ubah batas jajan" : "🎯 Atur batas jajan"}
      </button>
    );
  }
  const save = (value: number | null) => {
    setPlaceLimit(name, value);
    setEditing(false);
  };
  const tooBig = amount > MAX_LIMIT;
  const valid = amount > 0 && !tooBig;
  return (
    <form
      className="add-form deadline-form limit-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save(amount);
      }}
      onKeyDown={(e) => {
        // Esc menutup isian ini saja, bukan seluruh peta.
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setEditing(false);
        }
      }}
    >
      <label>
        Batas jajan per bulan
        <AmountInput value={amount} onChange={setAmount} placeholder="150.000" ariaLabel="Batas jajan per bulan" autoFocus />
      </label>
      {tooBig && <small className="cat-hint over">Maksimal {formatRupiah(MAX_LIMIT)}.</small>}
      <div className="confirm-row">
        <button className="pill on" type="submit" disabled={!valid}>
          💾 Simpan
        </button>
        {current && (
          <button className="pill ghost" type="button" onClick={() => save(null)}>
            Hapus batas
          </button>
        )}
        <button className="pill ghost" type="button" onClick={() => setEditing(false)}>
          Batal
        </button>
      </div>
      <small className="muted">
        {synced
          ? "Tersimpan di akunmu, ikut ke perangkat lain."
          : "Untuk sementara disimpan di perangkat ini, nanti dikirim ke akunmu begitu server siap."}
      </small>
    </form>
  );
}

/**
 * Sisa batas jajan sebuah tempat, mis. di catat cepat: "🎯 Kopi Toko Djawa: Rp153 rb dari batas
 * Rp150 rb bulan ini". `amount` = nominal yang sedang diketik (belum tersimpan).
 */
export function PlaceLimitHint({
  name,
  spent,
  limit,
  amount,
  periodWord
}: {
  name: string;
  spent: number;
  limit: number;
  amount: number;
  periodWord: string;
}) {
  const now = limitStatus(spent, limit);
  const after = limitStatus(spent + Math.max(0, amount), limit);
  if (!now || !after) return null;
  const level = now.level === "over" ? "over" : after.level;
  return (
    <p className={`cat-hint ${level}`}>
      {LIMIT_EMOJI[level]} {name}:{" "}
      {now.level === "over" ? (
        <>
          lewat <b><Money value={spent - limit} /></b> dari batas <Money value={limit} /> {periodWord}
        </>
      ) : (
        <>
          <b><Money value={spent} /></b> dari batas <Money value={limit} /> {periodWord} ({LIMIT_WORD[now.level]})
        </>
      )}
      {now.level !== "over" && after.level === "over" && (
        <> · nominal ini bikin lewat <Money value={spent + amount - limit} /></>
      )}
    </p>
  );
}
