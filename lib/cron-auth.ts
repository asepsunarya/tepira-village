import { timingSafeEqual } from "node:crypto";

/**
 * Cron Vercel mengirim `Authorization: Bearer $CRON_SECRET` kalau env itu diisi di project. Hanya itu
 * yang diterima (dibandingkan waktu-konstan); user-agent `vercel-cron` bisa dipalsukan siapa saja.
 * CRON_SECRET kosong = semua ditolak (gagal tertutup), bukan terbuka.
 */
export function cronAuthorized(authorization: string | null | undefined, secret: string | undefined): boolean {
  const s = (secret ?? "").trim();
  if (!s) return false;
  const got = Buffer.from(authorization ?? "", "utf8");
  const want = Buffer.from(`Bearer ${s}`, "utf8");
  // Panjang berbeda langsung ditolak (timingSafeEqual butuh panjang sama); panjang rahasia bukan rahasia.
  return got.length === want.length && timingSafeEqual(got, want);
}
