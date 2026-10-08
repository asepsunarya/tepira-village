"use client";

import { formatRupiah } from "@/lib/format";
import { useMoneyVisible } from "../store";

/** Nominal yang ikut mode privasi (disembunyikan jadi ••••). */
export function Money({ value, className = "", signed = false }: { value: number; className?: string; signed?: boolean }) {
  const visible = useMoneyVisible();
  if (!visible) return <span className={`money hidden ${className}`}>••••••</span>;
  const text = formatRupiah(Math.abs(value));
  return (
    <span className={`money ${className}`}>
      {signed ? (value < 0 ? "-" : "+") : value < 0 ? "-" : ""}
      {text}
    </span>
  );
}
