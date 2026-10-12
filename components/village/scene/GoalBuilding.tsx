"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { goalPace, type GoalView } from "@/lib/game";
import { goalPalette, goalPlot } from "../layout";
import { useVillage } from "../store";
import { smoothstep } from "./geometry";

const WALL_H = 2.3;
/**
 * Bangunan goal: tumbuh mengikuti progres tabungan.
 *   0%        → papan nama + kavling
 *   0–30%     → fondasi & tiang
 *   30–70%    → dinding meninggi
 *   70–100%   → atap terpasang
 *   100%      → selesai: cerobong, bendera, jendela menyala, bunga
 * Kalau goal punya target tanggal: tukang bekerja selama sesuai jadwal, rumput liar tumbuh
 * kalau telat ("proyek mangkrak").
 */
export default function GoalBuilding({ goal, index, lit }: { goal: GoalView; index: number; lit: boolean }) {
  const plot = goalPlot(index);
  const pal = goalPalette(index);
  const selected = useVillage((s) => s.selectedGoalId === goal.id && s.panel === "goals");
  const celebrate = useVillage((s) => s.celebrateGoalId === goal.id);
  const openGoal = useVillage((s) => s.openGoal);
  const pace = useMemo(() => goalPace(goal).status, [goal]);
  const overgrown = pace === "behind" || pace === "overdue";

  const walls = useRef<THREE.Mesh>(null);
  const roof = useRef<THREE.Group>(null);
  const scaffold = useRef<THREE.Group>(null);
  const flag = useRef<THREE.Mesh>(null);
  // Nilai tampil (dianimasikan menuju target supaya setoran terlihat "membangun").
  const shown = useRef({ wall: 0, roof: 0 });

  const p = goal.progress;
  const targetWall = smoothstep(0.02, 0.7, p);
  const targetRoof = smoothstep(0.7, 1, p);
  const done = p >= 1;

  useFrame((state, delta) => {
    const s = shown.current;
    const k = Math.min(1, delta * 2.2);
    s.wall += (targetWall - s.wall) * k;
    s.roof += (targetRoof - s.roof) * k;
    if (walls.current) {
      const h = Math.max(0.001, s.wall);
      walls.current.scale.y = h;
      walls.current.position.y = 0.45 + (WALL_H * h) / 2;
      walls.current.visible = s.wall > 0.01;
    }
    if (roof.current) {
      const r = Math.max(0.001, s.roof);
      roof.current.scale.setScalar(r);
      roof.current.position.y = 0.45 + WALL_H * s.wall;
      roof.current.visible = s.roof > 0.01;
    }
    if (scaffold.current) scaffold.current.visible = p > 0 && p < 1;
    if (flag.current) flag.current.rotation.y = Math.sin(state.clock.elapsedTime * 3) * 0.25;
  });

  const windowColor = lit || done ? "#ffe8a3" : "#cfe9ff";

  return (
    <group
      position={[plot.x, 0, plot.z]}
      rotation-y={plot.rot}
      onClick={(e) => {
        e.stopPropagation();
        openGoal(goal.id);
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      {/* kavling */}
      <mesh position-y={0.05} receiveShadow>
        <boxGeometry args={[5.2, 0.1, 5.2]} />
        <meshStandardMaterial color={done ? "#f7f2e9" : overgrown ? "#d9d4ad" : "#e9dcc8"} />
      </mesh>
      {selected && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.12}>
          <ringGeometry args={[3.0, 3.3, 48]} />
          <meshBasicMaterial color="#ff7eb3" />
        </mesh>
      )}

      {/* papan nama proyek */}
      <group position={[-1.9, 0, 2.1]} rotation-y={0.3}>
        <mesh position-y={0.6} castShadow>
          <boxGeometry args={[0.08, 1.1, 0.08]} />
          <meshStandardMaterial color="#a97a52" />
        </mesh>
        <mesh position-y={1.15} castShadow>
          <boxGeometry args={[1.1, 0.55, 0.08]} />
          <meshStandardMaterial color={done ? pal.roof : "#f7e7c6"} />
        </mesh>
      </group>

      {/* fondasi */}
      {p > 0 && (
        <mesh position-y={0.25} castShadow receiveShadow>
          <boxGeometry args={[3.1, 0.4, 2.9]} />
          <meshStandardMaterial color="#d6cbbd" />
        </mesh>
      )}

      {/* dinding (skala y dianimasikan) */}
      <mesh ref={walls} castShadow receiveShadow position-y={0.45}>
        <boxGeometry args={[2.8, WALL_H, 2.6]} />
        <meshStandardMaterial color={pal.body} />
      </mesh>

      {/* pintu & jendela, hanya saat dinding cukup tinggi */}
      {p >= 0.45 && (
        <>
          <mesh position={[0, 0.45 + 0.6 * Math.min(1, targetWall), 1.32]}>
            <boxGeometry args={[0.75, 1.2 * Math.min(1, targetWall), 0.1]} />
            <meshStandardMaterial color={pal.roof} />
          </mesh>
          {p >= 0.6 &&
            [-0.85, 0.85].map((x) => (
              <mesh key={x} position={[x, 0.45 + WALL_H * 0.7, 1.32]}>
                <boxGeometry args={[0.55, 0.55, 0.08]} />
                <meshStandardMaterial
                  color={windowColor}
                  emissive={windowColor}
                  emissiveIntensity={lit || done ? 0.9 : 0.05}
                />
              </mesh>
            ))}
        </>
      )}

      {/* atap */}
      <group ref={roof} position-y={0.45 + WALL_H}>
        <mesh position-y={0.8} rotation-y={Math.PI / 4} castShadow>
          <coneGeometry args={[2.25, 1.6, 4]} />
          <meshStandardMaterial color={pal.roof} flatShading />
        </mesh>
        {done && (
          <>
            <mesh position={[0.8, 0.9, -0.5]} castShadow>
              <boxGeometry args={[0.45, 1.0, 0.45]} />
              <meshStandardMaterial color="#e8c9b5" />
            </mesh>
            <mesh position={[0, 2.1, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 1.2, 6]} />
              <meshStandardMaterial color="#8b6b4f" />
            </mesh>
            <mesh ref={flag} position={[0.3, 2.5, 0]}>
              <boxGeometry args={[0.6, 0.38, 0.04]} />
              <meshStandardMaterial color="#ffd23f" />
            </mesh>
          </>
        )}
      </group>

      {/* perancah saat masih dibangun */}
      <group ref={scaffold}>
        {[
          [-1.75, -1.6],
          [1.75, -1.6],
          [-1.75, 1.6],
          [1.75, 1.6]
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 1.4, z]} castShadow>
            <boxGeometry args={[0.1, 2.8, 0.1]} />
            <meshStandardMaterial color="#c99a66" />
          </mesh>
        ))}
        <mesh position={[0, 2.75, -1.6]}>
          <boxGeometry args={[3.6, 0.08, 0.08]} />
          <meshStandardMaterial color="#c99a66" />
        </mesh>
        <mesh position={[0, 2.75, 1.6]}>
          <boxGeometry args={[3.6, 0.08, 0.08]} />
          <meshStandardMaterial color="#c99a66" />
        </mesh>
        {/* tumpukan bata */}
        <mesh position={[1.9, 0.25, 1.9]} castShadow>
          <boxGeometry args={[0.7, 0.3, 0.5]} />
          <meshStandardMaterial color="#e08f74" />
        </mesh>
      </group>

      {/* hiasan saat selesai */}
      {done &&
        [
          [-1.6, 2.1],
          [1.6, 2.1],
          [2.1, -1.4]
        ].map(([x, z], i) => (
          <group key={i} position={[x, 0.1, z]}>
            <mesh position-y={0.2}>
              <cylinderGeometry args={[0.03, 0.03, 0.4, 4]} />
              <meshStandardMaterial color="#6abf5e" />
            </mesh>
            <mesh position-y={0.42}>
              <sphereGeometry args={[0.16, 8, 6]} />
              <meshStandardMaterial color={["#ff8fb1", "#ffd166", "#c3a0ff"][i]} />
            </mesh>
          </group>
        ))}

      {celebrate && <Confetti />}
      {overgrown && <Weeds />}
      {(pace === "ontrack" || pace === "ahead") && <Worker />}

    </group>
  );
}

/** Rumpun rumput liar di kavling: [x, z, skala]. */
const WEEDS: [number, number, number][] = [
  [-2.2, -1.8, 1.1],
  [-2.25, -0.2, 0.9],
  [-2.3, 1.3, 1.2],
  [-1.3, 2.3, 1],
  [0.2, 2.35, 1.15],
  [1.5, 2.3, 0.9],
  [2.3, 1.1, 1.1],
  [2.25, -0.6, 1.25],
  [1.9, -2.2, 0.95],
  [0.3, -2.3, 1.1],
  [-1.1, -2.3, 0.9],
  [-0.9, 1.75, 0.8]
];

function Weeds() {
  return (
    <>
      {WEEDS.map(([x, z, s], i) => (
        <group key={i} position={[x, 0.1, z]} scale={s} rotation-y={i * 1.7}>
          {[-0.16, -0.05, 0.06, 0.17].map((dx, j) => (
            <mesh key={j} position={[dx, 0.4, j % 2 ? 0.08 : -0.04]} rotation-z={dx * 2}>
              <coneGeometry args={[0.12, 0.75 + (j % 3) * 0.18, 4]} />
              <meshStandardMaterial color={j % 2 ? "#7d8f45" : "#98a85a"} flatShading />
            </mesh>
          ))}
          {i % 2 === 0 && (
            <mesh position={[0.3, 0.22, -0.15]}>
              <sphereGeometry args={[0.32, 7, 5]} />
              <meshStandardMaterial color="#8a9a4b" flatShading />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}

/** Tukang berhelm kuning yang memukul palu di sisi bangunan. */
function Worker() {
  const arm = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (arm.current) arm.current.rotation.x = -0.9 + Math.max(0, Math.sin(state.clock.elapsedTime * 7)) * 1.1;
  });
  return (
    <group position={[2.3, 0.1, 0.7]} rotation-y={-Math.PI / 2 + 0.35} scale={0.8}>
      <mesh position-y={0.6} castShadow>
        <capsuleGeometry args={[0.32, 0.42, 4, 10]} />
        <meshStandardMaterial color="#f28c38" />
      </mesh>
      <mesh position-y={1.24} castShadow>
        <sphereGeometry args={[0.34, 14, 12]} />
        <meshStandardMaterial color="#ffe3cf" />
      </mesh>
      <mesh position-y={1.4} castShadow>
        <sphereGeometry args={[0.37, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#ffd23f" />
      </mesh>
      <mesh position-y={1.4}>
        <cylinderGeometry args={[0.46, 0.46, 0.04, 16]} />
        <meshStandardMaterial color="#ffd23f" />
      </mesh>
      <group ref={arm} position={[0.34, 0.85, 0.05]}>
        <mesh position={[0, 0, 0.22]} rotation-x={Math.PI / 2}>
          <capsuleGeometry args={[0.08, 0.3, 4, 6]} />
          <meshStandardMaterial color="#f28c38" />
        </mesh>
        <mesh position={[0, 0.12, 0.46]}>
          <boxGeometry args={[0.05, 0.32, 0.05]} />
          <meshStandardMaterial color="#a97a52" />
        </mesh>
        <mesh position={[0, 0.3, 0.46]}>
          <boxGeometry args={[0.1, 0.1, 0.22]} />
          <meshStandardMaterial color="#6f5b73" />
        </mesh>
      </group>
    </group>
  );
}

function Confetti() {
  const group = useRef<THREE.Group>(null);
  const seeds = useRef(
    Array.from({ length: 26 }, (_, i) => ({
      a: (i / 26) * Math.PI * 2 + Math.random() * 0.3,
      r: 1.4 + Math.random() * 1.6,
      speed: 1.2 + Math.random() * 1.4,
      phase: Math.random() * 6,
      color: ["#ffd23f", "#ff7eb3", "#6cc8ad", "#7cc3e8", "#c3a0ff"][i % 5]
    }))
  );
  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.children.forEach((c, i) => {
      const s = seeds.current[i];
      const y = 1 + ((t * s.speed + s.phase) % 5);
      c.position.set(Math.cos(s.a + t * 0.6) * s.r, y, Math.sin(s.a + t * 0.6) * s.r);
      c.rotation.set(t * 3 + i, t * 2, 0);
    });
  });
  return (
    <group ref={group}>
      {seeds.current.map((s, i) => (
        <mesh key={i}>
          <boxGeometry args={[0.22, 0.22, 0.05]} />
          <meshStandardMaterial color={s.color} emissive={s.color} emissiveIntensity={0.4} />
        </mesh>
      ))}
    </group>
  );
}
