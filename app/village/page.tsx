import type { Viewport } from "next";
import { getRequiredUserId } from "@/lib/auth";
import { buildSnapshot, isNewVillager, normalizePeriod } from "@/lib/snapshot";
import { processDueRecurring } from "@/lib/recurring-server";
import VillageApp from "@/components/village/VillageApp";

export const dynamic = "force-dynamic";

// Desa 3D layar penuh: cubit = zoom pulau, bukan zoom halaman. Halaman lain tetap bisa di-zoom.
export const viewport: Viewport = { maximumScale: 1 };

interface Props {
  searchParams: Promise<{ month?: string; year?: string }>;
}

export default async function VillagePage({ searchParams }: Props) {
  const params = await searchParams;
  const userId = await getRequiredUserId();
  const { month, year } = normalizePeriod(Number(params.month), Number(params.year));
  // Tagihan rutin yang jatuh tempo diantar dulu, supaya saldo dompet di render pertama sudah terpotong.
  // Tidak pernah menggagalkan halaman (tabel belum ada = dilewati di dalamnya).
  await processDueRecurring({ userId }).catch((error) => console.error("[recurring]", error));
  const [snapshot, isNewUser] = await Promise.all([buildSnapshot(userId, month, year), isNewVillager(userId)]);
  return <VillageApp initial={snapshot} isNewUser={isNewUser} />;
}
