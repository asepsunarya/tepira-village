"use client";

import { useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { LAMP_POSTS } from "../layout";
import { useVillage } from "../store";
import { useStreak } from "../useProgress";

const POST = "#6f5b73";

/**
 * Lampu jalan streak: satu lampu per hari dari 7 hari terakhir (indeks 6 = hari ini, di depan
 * Balai Desa). Menyala kalau hari itu tercatat; lampu hari ini berdenyut pelan selama belum.
 */
export default function StreetLamps({ night }: { night: boolean }) {
  const streak = useStreak();
  const setPanel = useVillage((s) => s.setPanel);
  const open = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    setPanel("village");
  };
  return (
    <group>
      {LAMP_POSTS.map(([x, z], i) => {
        const day = streak.week[i];
        return (
          <Lamp
            key={i}
            x={x}
            z={z}
            lit={day.recorded || day.noSpend}
            pending={i === 6 && !streak.todayDone}
            night={night}
            onClick={open}
          />
        );
      })}
    </group>
  );
}

function Lamp({
  x,
  z,
  lit,
  pending,
  night,
  onClick
}: {
  x: number;
  z: number;
  lit: boolean;
  pending: boolean;
  night: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const bulb = useRef<THREE.MeshStandardMaterial>(null);
  const glow = lit ? (night ? 2.4 : 1.2) : 0;

  useFrame((state) => {
    if (!bulb.current) return;
    bulb.current.emissiveIntensity = pending ? 0.35 + Math.sin(state.clock.elapsedTime * 3) * 0.3 : glow;
  });

  return (
    <group
      position={[x, 0, z]}
      onClick={onClick}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <mesh position-y={0.08} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.25, 0.16, 8]} />
        <meshStandardMaterial color="#8a7a8e" />
      </mesh>
      <mesh position-y={1.12} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 2.0, 6]} />
        <meshStandardMaterial color={POST} />
      </mesh>
      <mesh position-y={2.32}>
        <boxGeometry args={[0.34, 0.4, 0.34]} />
        <meshStandardMaterial
          ref={bulb}
          color={lit ? "#ffe9a8" : pending ? "#fff3d6" : "#ece6ef"}
          emissive={lit || pending ? "#ffc94d" : "#000000"}
          emissiveIntensity={glow}
        />
      </mesh>
      <mesh position-y={2.62} rotation-y={Math.PI / 4} castShadow>
        <coneGeometry args={[0.34, 0.26, 4]} />
        <meshStandardMaterial color={POST} flatShading />
      </mesh>
      {lit && (
        <mesh position-y={2.32}>
          <sphereGeometry args={[night ? 0.8 : 0.5, 12, 10]} />
          <meshBasicMaterial
            color="#ffe7a0"
            transparent
            opacity={night ? 0.32 : 0.16}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
      {lit && night && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.22}>
          <circleGeometry args={[1.3, 24]} />
          <meshBasicMaterial color="#ffe7a0" transparent opacity={0.22} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
