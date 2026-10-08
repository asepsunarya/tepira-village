"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import type { Snapshot } from "@/lib/game";
import { useVillage } from "./store";
import HUD from "./ui/HUD";
import Panels from "./ui/Panels";
import PinGate from "./ui/PinGate";
import LabelLayer from "./ui/LabelLayer";

// Canvas WebGL hanya di browser.
const Scene = dynamic(() => import("./scene/Scene"), {
  ssr: false,
  loading: () => <div className="scene-loading">Menyiapkan desa…</div>
});

export default function VillageApp({ initial }: { initial: Snapshot }) {
  const hydrate = useVillage((s) => s.hydrate);
  const hydrated = useVillage((s) => s.snapshot !== null);

  // Hidrasi sekali per sesi/user. Snapshot berikutnya datang dari server action,
  // jadi re-render halaman (mis. setelah navigasi) tidak boleh menimpa bulan yang dipilih.
  useEffect(() => {
    const current = useVillage.getState().snapshot;
    if (!current || current.user.email !== initial.user.email) hydrate(initial);
  }, [initial, hydrate]);

  return (
    <div className="app">
      {hydrated && <Scene />}
      {hydrated && <LabelLayer />}
      <HUD />
      <Panels />
      <PinGate />
    </div>
  );
}
