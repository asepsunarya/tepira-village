import { handleCronRequest } from "@/lib/reminder-cron";

/**
 * Cron Vercel "0 0 * * *" (07:00–07:59 WIB, lihat vercel.json): Pak Pos memproses jatuh tempo semua
 * user, lalu push "📬 Tukang pos membawa N tagihan" (hanya jumlah). Hanya Bearer CRON_SECRET.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(request: Request) {
  return handleCronRequest(request, "postman");
}
