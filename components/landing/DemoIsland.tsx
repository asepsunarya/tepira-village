"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { GoalView, WalletView } from "@/lib/game";
import { buildStage, levelFor, villageXp } from "@/lib/game";
import { formatCompact } from "@/lib/format";
import { createDemoSnapshot, isDemoSnapshot, withDemoContribution } from "@/lib/demo-snapshot";
import { TIME_PRESETS, autoTime, goalPalette, goalPlot } from "@/components/village/layout";
import { useVillage } from "@/components/village/store";
import Island from "@/components/village/scene/Island";
import Path from "@/components/village/scene/Path";
import Decor from "@/components/village/scene/Decor";
import GoalBuilding from "@/components/village/scene/GoalBuilding";
import WalletChest from "@/components/village/scene/WalletChest";
import Warung from "@/components/village/scene/Warung";
import Hall from "@/components/village/scene/Hall";
import Villager from "@/components/village/scene/Villager";
import { Clouds } from "@/components/village/scene/Effects";
import LabelProjector from "@/components/village/scene/LabelProjector";
import { useWorldLabel, type Anchor } from "@/components/village/scene/labels";

/**
 * Desa contoh di hero landing. Sengaja TIDAK memakai <Scene/> apa adanya:
 * OrbitControls-nya menangkap scroll/swipe halaman, Scene mengubah warna body,
 * dan mengikuti preferensi cuaca user. Di sini potongan scene yang sama dirakit
 * ulang: kamera berputar pelan sendiri, tanpa input, data 100% fiktif.
 */

const EMPTY_GOALS: GoalView[] = [];
const EMPTY_WALLETS: WalletView[] = [];

// State store yang disentuh demo; dikosongkan lagi saat unmount supaya /village hidrasi bersih.
const clean = () => ({
  panel: null,
  selectedGoalId: null,
  selectedWalletId: null,
  toasts: [],
  villagerTarget: null,
  celebrateGoalId: null
});

/** Urutan goal yang "dibangun" demo (indeks kavling): Laptop → Sepeda → Dana darurat. */
const GROW_ORDER = [1, 3, 0];
const FIRST_STEP_MS = 2600;
/** Tunggu bangunan selesai "tumbuh" dari tanah sebelum poster diganti 3D. */
const REVEAL_MS = 1400;
const STEP_MS = 5200;
/** Titik tengah orbit: sama dengan framing poster supaya pergantian poster → 3D mulus. */
const TARGET: [number, number, number] = [3.8, 0, -2];
const ORBIT_R = Math.hypot(36, 36);
const ORBIT_SPEED = 0.05;
// Konstanta di luar komponen supaya <Canvas/> tidak menganggap props berubah tiap render.
const CAMERA = { position: [TARGET[0] + 36, 32, TARGET[2] + 36] as [number, number, number], zoom: 16, near: -500, far: 1000 };
const GL = { antialias: true, powerPreference: "low-power" as const };
const DPR: [number, number] = [1, 1.75];
// Tanpa input sama sekali: scroll/swipe halaman tetap jalan, klik tidak membuka panel apa pun.
const NO_INPUT = { pointerEvents: "none" as const };

interface DemoToast {
  id: number;
  x: number;
  y: number;
  z: number;
  text: string;
  sub: string;
}

function CameraRig() {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const angle = useRef(Math.PI / 4);

  useEffect(() => {
    // Skala sama dengan poster (screenshot 1400px, zoom 22, dipotong 780×650).
    camera.zoom = Math.min(width / 35.5, height / 29.6);
    camera.updateProjectionMatrix();
  }, [camera, width, height]);

  useFrame((_, delta) => {
    angle.current += Math.min(delta, 0.1) * ORBIT_SPEED;
    const a = angle.current;
    camera.position.set(TARGET[0] + Math.cos(a) * ORBIT_R, 32, TARGET[2] + Math.sin(a) * ORBIT_R);
    camera.lookAt(TARGET[0], TARGET[1], TARGET[2]);
  });
  return null;
}

function DemoWorld() {
  const goals = useVillage((s) => s.snapshot?.goals) ?? EMPTY_GOALS;
  const wallets = useVillage((s) => s.snapshot?.wallets) ?? EMPTY_WALLETS;
  const health = useVillage((s) => s.snapshot?.summary.health.score ?? 70);
  const time = autoTime(health);
  const p = TIME_PRESETS[time];
  const assets = wallets.filter((w) => !w.isDebt).reduce((s, w) => s + Math.max(0, w.balance), 0);

  return (
    <>
      <color attach="background" args={[p.bg]} />
      <CameraRig />
      <ambientLight intensity={p.ambient} color={p.ambientColor} />
      <hemisphereLight args={[p.sky, p.ground, 0.6]} />
      <directionalLight
        position={p.sunPos}
        intensity={p.sun}
        color={p.sunColor}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-bias={-0.0006}
        shadow-normalBias={0.03}
      />
      <Island sea={p.sea} />
      <Path />
      <Decor usedPlots={goals.length} walletCount={wallets.length} />
      <Hall lit={p.windows} />
      <Warung lit={p.windows} />
      {goals.map((g, i) => (
        <GoalBuilding key={g.id} goal={g} index={i} lit={p.windows} />
      ))}
      {wallets.map((w, i) => (
        <WalletChest
          key={w.id}
          wallet={w}
          index={i}
          share={assets > 0 && !w.isDebt ? Math.max(0, w.balance) / assets : 0}
        />
      ))}
      <Villager />
      <LabelProjector />
      {time === "day" && <Clouds count={4} />}
      {time === "cloudy" && <Clouds count={9} tint="#f4f6fa" opacity={0.95} />}
      {time === "sunset" && <Clouds count={5} tint="#ffd9c4" opacity={0.85} />}
    </>
  );
}

function Label({ id, position, anchor, children }: { id: string; position: [number, number, number]; anchor?: Anchor; children: ReactNode }) {
  const ref = useWorldLabel(id, position, anchor);
  return (
    <div ref={ref} className="world-label" style={{ display: "none" }}>
      {children}
    </div>
  );
}

const STAGE_LABEL: Record<ReturnType<typeof buildStage>, string> = {
  lahan: "Lahan kosong",
  fondasi: "Fondasi",
  dinding: "Dinding naik",
  atap: "Pasang atap",
  selesai: "Selesai!"
};

function DemoLabels({ toasts }: { toasts: DemoToast[] }) {
  const goals = useVillage((s) => s.snapshot?.goals) ?? EMPTY_GOALS;
  const totals = useVillage((s) => s.snapshot?.totals);
  const level = totals ? levelFor(villageXp(totals.totalSaved, totals.contributionCount)) : 1;

  return (
    <div className="label-layer lp-demo-labels">
      {goals.map((goal, i) => {
        const plot = goalPlot(i);
        const done = goal.progress >= 1;
        const percent = Math.round(goal.progress * 100);
        return (
          <Label key={goal.id} id={`demo-goal-${goal.id}`} position={[plot.x, done ? 5.6 : 4.1, plot.z]}>
            <div className={`goal-label ${done ? "is-done" : ""}`}>
              <div className="goal-label-title">
                <span>{done ? "🏡" : "🏗️"}</span>
                <span className="goal-label-name">{goal.title}</span>
                <span className="goal-label-pct">{percent}%</span>
              </div>
              <div className="goal-label-bar">
                <div style={{ width: `${percent}%`, background: goalPalette(i).roof }} />
              </div>
              <div className="goal-label-sub">
                {formatCompact(goal.saved)} / {formatCompact(goal.targetAmount)}
                <span className="goal-label-stage">{STAGE_LABEL[buildStage(goal.progress)]}</span>
              </div>
            </div>
          </Label>
        );
      })}
      {/* posisinya digerakkan tiap frame oleh <Villager/> lewat id "villager" */}
      <Label id="villager" position={[0, -0.15, 1.2]} anchor="center">
        <div className="name-pill is-you">
          <span className="name-emoji">🐷</span>
          <span>Kamu</span>
          <span className="lv">Lv{level}</span>
        </div>
      </Label>
      {toasts.map((t) => (
        <Label key={t.id} id={`demo-toast-${t.id}`} position={[t.x, t.y, t.z]} anchor="center">
          <div className="xp-toast tone-save">
            <div className="xp-toast-main">{t.text}</div>
            <div className="xp-toast-sub">{t.sub}</div>
          </div>
        </Label>
      ))}
    </div>
  );
}

/** Setoran berikutnya: ±10% target, dibulatkan ke Rp50 rb, tidak melebihi sisa. */
function nextStep(goal: GoalView) {
  const step = Math.max(50_000, Math.round((goal.targetAmount * 0.1) / 50_000) * 50_000);
  return Math.min(step, goal.targetAmount - goal.saved);
}

export default function DemoIsland({ active, onReady }: { active: boolean; onReady?: () => void }) {
  const [hydrated, setHydrated] = useState(false);
  const [toasts, setToasts] = useState<DemoToast[]>([]);
  const toastId = useRef(0);
  const rest = useRef(0);

  // Isi store dengan desa contoh; kosongkan lagi saat pergi supaya tidak bocor ke /village.
  useEffect(() => {
    useVillage.setState({ ...clean(), snapshot: createDemoSnapshot(), unlocked: true });
    setHydrated(true);
    return () => {
      if (isDemoSnapshot(useVillage.getState().snapshot)) {
        useVillage.setState({ ...clean(), snapshot: null, unlocked: false });
      }
    };
  }, []);

  // Loop "nabung teu pira": si penabung lari ke kavling, bangunan naik, konfeti saat rampung.
  useEffect(() => {
    if (!hydrated || !active) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
    };

    const tick = () => {
      later(tick, STEP_MS);
      if (rest.current > 0) {
        rest.current -= 1;
        return;
      }
      const snap = useVillage.getState().snapshot;
      if (!snap || !isDemoSnapshot(snap)) return;
      const idx = GROW_ORDER.find((i) => snap.goals[i] && snap.goals[i].progress < 1);
      if (idx === undefined) {
        // Semua rampung: desa contoh mulai dari awal lagi.
        useVillage.setState({ snapshot: createDemoSnapshot(), celebrateGoalId: null });
        return;
      }
      const goal = snap.goals[idx];
      const amount = nextStep(goal);
      const next = withDemoContribution(snap, goal.id, amount);
      const after = next.goals[idx];
      const plot = goalPlot(idx);
      useVillage.setState((s) => ({
        snapshot: next,
        villagerTarget: { x: plot.x, z: plot.z + 3.2, kind: "save", nonce: (s.villagerTarget?.nonce ?? 0) + 1 }
      }));

      const id = ++toastId.current;
      setToasts((list) => [
        ...list,
        {
          id,
          x: plot.x,
          y: 4.6,
          z: plot.z,
          text: `+${formatCompact(amount)}`,
          sub: `${Math.round(after.progress * 100)}% · ${after.title}`
        }
      ]);
      later(() => setToasts((list) => list.filter((t) => t.id !== id)), 2800);

      if (after.progress >= 1) {
        useVillage.setState({ celebrateGoalId: after.id });
        rest.current = 1;
        later(() => {
          if (useVillage.getState().celebrateGoalId === after.id) useVillage.setState({ celebrateGoalId: null });
        }, 6000);
      }
    };

    later(tick, FIRST_STEP_MS);
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
      setToasts([]);
      if (isDemoSnapshot(useVillage.getState().snapshot)) useVillage.setState({ celebrateGoalId: null });
    };
  }, [hydrated, active]);

  if (!hydrated) return null;

  return (
    <div className="lp-demo">
      <Canvas
        shadows
        orthographic
        dpr={DPR}
        frameloop={active ? "always" : "demand"}
        gl={GL}
        camera={CAMERA}
        style={NO_INPUT}
        onCreated={() => setTimeout(() => onReady?.(), REVEAL_MS)}
      >
        <DemoWorld />
      </Canvas>
      <DemoLabels toasts={toasts} />
    </div>
  );
}
