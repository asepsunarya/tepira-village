"use client";

import { useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { DOCK } from "../layout";
import { useVillage } from "../store";
import { useStreak } from "../useProgress";
import { randomWanderTarget } from "./geometry";

/** Baju & rambut tiap warga sesuai urutan datang (VILLAGER_NAMES); sebagian pakai caping. */
const OUTFITS = [
  { shirt: "#7cc3e8", hair: "#3a2b2b", caping: true },
  { shirt: "#f0a06a", hair: "#5a4a5e", caping: false },
  { shirt: "#8fcf7e", hair: "#2f2433", caping: true },
  { shirt: "#c3a0ff", hair: "#6b4a3a", caping: false },
  { shirt: "#e9c46a", hair: "#3a2b2b", caping: false },
  { shirt: "#6cc8ad", hair: "#5a4a5e", caping: true },
  { shirt: "#f78fb3", hair: "#2f2433", caping: false },
  { shirt: "#b07d55", hair: "#6b4a3a", caping: true }
];

const SPEED = 1.5;
const SKIN = "#ffe3cf";

/** Warga desa: satu orang pindah ke desa tiap 7 hari beruntun, lalu jalan-jalan santai. */
export default function Townsfolk() {
  const { villagers } = useStreak();
  const setPanel = useVillage((s) => s.setPanel);
  // Warga yang datang selagi desa terbuka berjalan masuk dari pantai dekat dermaga.
  const initial = useRef(villagers);
  const open = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    setPanel("village");
  };
  return (
    <>
      {Array.from({ length: villagers }, (_, i) => (
        <Folk key={i} outfit={OUTFITS[i % OUTFITS.length]} arriving={i >= initial.current} onClick={open} />
      ))}
    </>
  );
}

interface Runtime {
  x: number;
  z: number;
  tx: number;
  tz: number;
  wait: number;
  yaw: number;
  t: number;
}

function Folk({
  outfit,
  arriving,
  onClick
}: {
  outfit: (typeof OUTFITS)[number];
  arriving: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const rt = useRef<Runtime | null>(null);
  if (!rt.current) {
    const [x, z] = arriving ? [DOCK.x + 0.3, DOCK.z - 0.6] : randomWanderTarget();
    const [tx, tz] = randomWanderTarget();
    rt.current = { x, z, tx, tz, wait: arriving ? 0 : Math.random() * 3, yaw: 0, t: Math.random() * 10 };
  }

  useFrame((_, delta) => {
    const r = rt.current!;
    const dt = Math.min(delta, 0.05);
    r.t += dt;
    let moving = false;
    if (r.wait > 0) {
      r.wait -= dt;
    } else {
      const dx = r.tx - r.x;
      const dz = r.tz - r.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.12) {
        moving = true;
        const step = Math.min(dist, SPEED * dt);
        r.x += (dx / dist) * step;
        r.z += (dz / dist) * step;
        let diff = Math.atan2(dx, dz) - r.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        r.yaw += diff * Math.min(1, dt * 6);
      } else {
        [r.tx, r.tz] = randomWanderTarget();
        r.wait = 2 + Math.random() * 5;
      }
    }
    const g = group.current;
    if (!g) return;
    g.position.set(r.x, moving ? Math.abs(Math.sin(r.t * 9)) * 0.1 : 0, r.z);
    g.rotation.y = r.yaw;
    if (body.current) body.current.rotation.z = moving ? Math.sin(r.t * 9) * 0.07 : Math.sin(r.t * 1.5) * 0.03;
  });

  return (
    <group
      ref={group}
      scale={0.85}
      onClick={onClick}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <group ref={body}>
        <mesh position-y={0.6} castShadow>
          <capsuleGeometry args={[0.32, 0.42, 4, 10]} />
          <meshStandardMaterial color={outfit.shirt} />
        </mesh>
        <mesh position-y={1.24} castShadow>
          <sphereGeometry args={[0.34, 14, 12]} />
          <meshStandardMaterial color={SKIN} />
        </mesh>
        <mesh position-y={1.37} scale={[1, 0.7, 1]} castShadow>
          <sphereGeometry args={[0.36, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={outfit.hair} />
        </mesh>
        {outfit.caping && (
          <mesh position-y={1.62} castShadow>
            <coneGeometry args={[0.62, 0.32, 12]} />
            <meshStandardMaterial color="#e8c77a" flatShading />
          </mesh>
        )}
        {[-0.11, 0.11].map((x) => (
          <mesh key={x} position={[x, 1.26, 0.3]}>
            <sphereGeometry args={[0.045, 6, 6]} />
            <meshStandardMaterial color="#3a2b2b" />
          </mesh>
        ))}
      </group>
    </group>
  );
}
