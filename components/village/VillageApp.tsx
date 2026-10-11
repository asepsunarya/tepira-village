"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import type { Snapshot } from "@/lib/game";
import { useVillage } from "./store";
import HUD from "./ui/HUD";
import Panels from "./ui/Panels";
import PinGate from "./ui/PinGate";
import LabelLayer from "./ui/LabelLayer";
import Tutorial, { useTourOn } from "./ui/Tutorial";

// Canvas WebGL hanya di browser.
const Scene = dynamic(() => import("./scene/Scene"), {
  ssr: false,
  loading: () => <div className="scene-loading">Menyiapkan desa…</div>
});

/** `isNewUser` dihitung server sekali saat halaman dimuat (lihat isNewVillager di lib/snapshot.ts). */
export default function VillageApp({ initial, isNewUser }: { initial: Snapshot; isNewUser: boolean }) {
  const hydrate = useVillage((s) => s.hydrate);
  // Snapshot milik user lain / sisa desa contoh landing belum dihitung "terhidrasi".
  const hydrated = useVillage((s) => s.snapshot !== null && s.snapshot.user.email === initial.user.email);
  const tourOn = useTourOn();

  // Hidrasi sekali per sesi/user. Snapshot berikutnya datang dari server action,
  // jadi re-render halaman (mis. setelah navigasi) tidak boleh menimpa bulan yang dipilih.
  useEffect(() => {
    const current = useVillage.getState().snapshot;
    if (!current || current.user.email !== initial.user.email) hydrate(initial);
  }, [initial, hydrate]);

  return (
    <div className={`app ${tourOn ? "tour-on" : ""}`}>
      {hydrated && <Scene />}
      {hydrated && <LabelLayer />}
      <HUD />
      <Panels />
      <PinGate />
      {hydrated && <Tutorial email={initial.user.email} isNew={isNewUser} />}
    </div>
  );
}
