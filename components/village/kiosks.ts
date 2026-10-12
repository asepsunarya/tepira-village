import type { Snapshot } from "@/lib/game";
import { pickKiosks, type Kiosk } from "@/lib/kiosks";
import type { PlaceLimits } from "@/lib/place-limits";
import { spendByPlaceName } from "@/lib/places";
import { KIOSK_SPOTS, kioskBlockedSlots } from "./layout";

export type PlacedKiosk = Kiosk & { spot: (typeof KIOSK_SPOTS)[number] };

/** Kios yang berdiri di pulau untuk snapshot ini (dipakai scene, label, dan store). */
export function placedKiosks(snapshot: Snapshot, limits: PlaceLimits): PlacedKiosk[] {
  return pickKiosks(
    snapshot.places,
    spendByPlaceName(snapshot.expenses),
    limits,
    KIOSK_SPOTS.length,
    kioskBlockedSlots(snapshot.goals.length)
  ).map((k) => ({ ...k, spot: KIOSK_SPOTS[k.slot] }));
}
