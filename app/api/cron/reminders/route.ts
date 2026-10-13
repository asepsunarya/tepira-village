import { handleCronRequest } from "@/lib/reminder-cron";

/**
 * Cron Vercel "0 13 * * *" (20:00–20:59 WIB, lihat vercel.json): susulan Pak Pos, push "💡 Lampu hari
 * ini belum menyala" ke yang hari ini belum tercatat, plus tagihan yang belum dikabarkan hari ini.
 * Hanya Bearer CRON_SECRET.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(request: Request) {
  return handleCronRequest(request, "reminders");
}
