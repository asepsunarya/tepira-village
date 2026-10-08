import { getRequiredUserId } from "@/lib/auth";
import { buildSnapshot, normalizePeriod } from "@/lib/snapshot";
import VillageApp from "@/components/village/VillageApp";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ month?: string; year?: string }>;
}

export default async function VillagePage({ searchParams }: Props) {
  const params = await searchParams;
  const userId = await getRequiredUserId();
  const { month, year } = normalizePeriod(Number(params.month), Number(params.year));
  const snapshot = await buildSnapshot(userId, month, year);
  return <VillageApp initial={snapshot} />;
}
