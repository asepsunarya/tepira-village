"use client";

import { useEffect, useRef, type ComponentRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { seasonForMonth } from "@/lib/season";
import { TIME_PRESETS, autoTime } from "../layout";
import { SEASON_LOOK } from "../seasons";
import { useVillage } from "../store";
import { isFullscreenPanel } from "../types";
import Island from "./Island";
import Path from "./Path";
import Decor from "./Decor";
import GoalBuilding from "./GoalBuilding";
import WalletChest from "./WalletChest";
import Warung from "./Warung";
import Hall from "./Hall";
import Villager from "./Villager";
import StreetLamps from "./StreetLamps";
import Townsfolk from "./Townsfolk";
import Postman from "./Postman";
import Unlocks from "./Unlocks";
import Mailbox from "./Mailbox";
import Kiosks from "./Kiosks";
import { Clouds } from "./Effects";
import LabelProjector from "./LabelProjector";
import SeasonFx from "./Seasons";

function Goals({ lit }: { lit: boolean }) {
  const goals = useVillage((s) => s.snapshot?.goals ?? []);
  return (
    <>
      {goals.map((g, i) => (
        <GoalBuilding key={g.id} goal={g} index={i} lit={lit} />
      ))}
    </>
  );
}

function Wallets() {
  const wallets = useVillage((s) => s.snapshot?.wallets ?? []);
  const assets = wallets.filter((w) => !w.isDebt).reduce((s, w) => s + Math.max(0, w.balance), 0);
  return (
    <>
      {wallets.map((w, i) => (
        <WalletChest key={w.id} wallet={w} index={i} share={assets > 0 && !w.isDebt ? Math.max(0, w.balance) / assets : 0} />
      ))}
    </>
  );
}

export default function Scene() {
  const timeSetting = useVillage((s) => s.ui.time);
  const health = useVillage((s) => s.snapshot?.summary.health.score ?? 70);
  const freeze = useVillage((s) => s.ui.freeze);
  const viewNonce = useVillage((s) => s.viewNonce);
  const goalCount = useVillage((s) => s.snapshot?.goals.length ?? 0);
  const walletCount = useVillage((s) => s.snapshot?.wallets.length ?? 0);
  const setPanel = useVillage((s) => s.setPanel);
  // Selama tampilan layar penuh terbuka (peta jajan, aliran uang), desa berhenti merender.
  const paused = useVillage((s) => isFullscreenPanel(s.panel));
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  // Musim mengikuti bulan yang dilihat (seperti cuaca & kios). Hanya Scene yang membacanya dari
  // store; Island/Decor/Unlocks menerimanya lewat prop supaya landing tetap seperti poster.
  const month = useVillage((s) => s.snapshot?.period.month ?? 1);
  const season = seasonForMonth(month);
  const look = SEASON_LOOK[season];

  const time = timeSetting === "auto" ? autoTime(health) : timeSetting;
  const p = TIME_PRESETS[time];

  useEffect(() => {
    document.body.style.background = p.bg;
  }, [p.bg]);

  useEffect(() => {
    if (viewNonce > 0) controls.current?.reset();
  }, [viewNonce]);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      frameloop={paused ? "never" : "always"}
      className="canvas"
      onPointerMissed={() => setPanel(null)}
    >
      <color attach="background" args={[p.bg]} />
      <OrthographicCamera makeDefault position={[36, 32, 36]} zoom={22} near={-500} far={1000} />
      <OrbitControls
        ref={controls}
        makeDefault
        enabled={!freeze}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.9}
        zoomSpeed={1.2}
        panSpeed={0.9}
        zoomToCursor
        minZoom={6}
        maxZoom={200}
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI / 2 - 0.04}
        target={[0, 0, 0]}
      />
      <ambientLight intensity={p.ambient} color={p.ambientColor} />
      <hemisphereLight args={[p.sky, p.ground, 0.6]} />
      <directionalLight
        position={p.sunPos}
        intensity={p.sun}
        color={p.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-bias={-0.0006}
        shadow-normalBias={0.03}
      />

      {/* Kolam = waduk desa: klik untuk melihat aliran uang bulan ini. */}
      <Island sea={p.sea} grass={look.grass} pondScale={look.pondScale} onPond={() => setPanel("aliran")} />
      <Path />
      <Decor usedPlots={goalCount} walletCount={walletCount} reserved season={season} />
      <Hall lit={p.windows} />
      <Warung lit={p.windows} />
      <Goals lit={p.windows} />
      <Wallets />
      <StreetLamps night={p.windows} />
      <Mailbox />
      <Unlocks night={p.windows} grass={look.grass} />
      <Kiosks lit={p.windows} />
      <Villager />
      <Townsfolk />
      <Postman />
      <LabelProjector />
      <SeasonFx season={season} month={month} time={time} />
      {time === "cloudy" && <Clouds count={9} tint="#f4f6fa" opacity={0.95} />}
      {time === "day" && <Clouds count={4} />}
      {time === "sunset" && <Clouds count={5} tint="#ffd9c4" opacity={0.85} />}
    </Canvas>
  );
}
